import { EventBus, EVENTS, QUEUES } from '@streamia/shared';
import mongoose from 'mongoose';
import fs from 'fs';
import { Movie, IMovie } from '../models/Movie';
import { uploadToCloudinary, uploadSubtitle } from '../config/cloudinary';

// Define interfaces for Service Inputs
export interface CreateMovieInput {
  title?: string;
  description?: string;
  category?: string;
}

export interface AddSubtitleInput {
  language: string;
  label: string;
}

export interface RatingEventPayload {
  movieId: string;
  averageRating: number;
  ratingsCount: number;
}

export class MovieService {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.initializeSubscribers();
  }

  /**
   * Initialize Event Subscribers
   */
  private async initializeSubscribers() {
    try {
      const ratingHandler = this.handleRatingUpdate.bind(this);
      
      await this.eventBus.subscribe(EVENTS.RATING_CREATED, ratingHandler, QUEUES.RATINGS_MOVIE_QUEUE);
      await this.eventBus.subscribe(EVENTS.RATING_UPDATED, ratingHandler, QUEUES.RATINGS_MOVIE_QUEUE);
      await this.eventBus.subscribe(EVENTS.RATING_DELETED, ratingHandler, QUEUES.RATINGS_MOVIE_QUEUE);
      
      console.log('[MovieService] Subscribed to rating events');
    } catch (error) {
      console.error('[MovieService] Failed to subscribe to events:', error);
    }
  }

  /**
   * Handle incoming rating updates
   */
  private async handleRatingUpdate(event: any): Promise<void> {
    try {
      const { movieId, averageRating, ratingsCount } = event.payload as RatingEventPayload;
      
      if (!mongoose.Types.ObjectId.isValid(movieId)) return;

      await Movie.findByIdAndUpdate(movieId, { 
        $set: { 
          averageRating, 
          ratingsCount 
        } 
      });
      
      console.log(`[MovieService] Updated ratings for movie ${movieId}: ${averageRating} (${ratingsCount})`);
    } catch (error) {
      console.error('[MovieService] Error handling rating update:', error);
    }
  }

  /**
   * Upload and Create a new Movie
   */
  async createMovie(filePath: string, data: CreateMovieInput): Promise<IMovie> {
    try {
      console.log("📤 Uploading video to Cloudinary...");

      const uploadResult = await uploadToCloudinary(filePath, {
        folder: 'streamia/movies',
        resource_type: 'video'
      });

      const movieData = {
        title: data.title || `Movie ${uploadResult.public_id}`,
        description: data.description || "Description not available",
        category: data.category || "General",
        coverImage: uploadResult.thumbnail_url,
        videoUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        videoFormat: uploadResult.format,
        hasAudio: true,
        duration: Math.round(uploadResult.duration),
        provider: 'cloudinary'
      };

      const movie = await Movie.create(movieData);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await this.eventBus.publish(EVENTS.MOVIE_CREATED, {
        movieId: movie._id,
        title: movie.title,
        category: movie.category,
        videoUrl: movie.videoUrl
      });

      await this.eventBus.publish(EVENTS.MOVIE_VIDEO_UPLOADED, {
        movieId: movie._id,
        duration: movie.duration,
        format: movie.videoFormat
      });

      return movie;
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  }

  /**
   * Upload Subtitles for a Movie
   */
  async addSubtitle(movieId: string, filePath: string, data: AddSubtitleInput): Promise<IMovie> {
    try {
      const movie = await Movie.findById(movieId);
      if (!movie) {
        throw new Error('Movie not found');
      }

      console.log("📝 Uploading subtitles...");

      const subtitleResult = await uploadSubtitle(filePath, {
        folder: 'streamia/subtitles',
        public_id: `${movie.cloudinaryPublicId}_${data.language}`
      });

      movie.subtitles.push({
        language: data.language,
        label: data.label,
        url: subtitleResult.secure_url
      });

      await movie.save();

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await this.eventBus.publish(EVENTS.MOVIE_UPDATED, {
        movieId: movie._id,
        updateType: 'subtitles_added',
        language: data.language
      });

      return movie;
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  }

  /**
   * Get Movies with Pagination and Filtering
   */
  async getMovies(query: { category?: string; search?: string }): Promise<IMovie[]> {
    const filter: any = {};

    if (query.category) {
      filter.category = { $regex: query.category, $options: 'i' };
    }

    if (query.search) {
      filter.title = { $regex: query.search, $options: 'i' };
    }

    const movies = await Movie.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // FIX: Double cast to handle the .lean() return type mismatch
    // .lean() removes Mongoose methods (save, etc) which IMovie expects (since it extends Document)
    return movies as unknown as IMovie[];
  }

  /**
   * Get Movie by ID (supports ID, PublicID, ExternalID)
   */
  async getMovieById(id: string): Promise<IMovie> {
    let movie = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      movie = await Movie.findById(id);
    }

    if (!movie) {
      movie = await Movie.findOne({ cloudinaryPublicId: id });
    }

    if (!movie) {
      movie = await Movie.findOne({ externalId: id });
    }

    if (!movie) {
      throw new Error('Movie not found');
    }

    return movie;
  }

  /**
   * Update Movie Metadata
   */
  async updateMovie(id: string, updates: Partial<IMovie>): Promise<IMovie> {
    const movie = await Movie.findByIdAndUpdate(id, updates, { new: true });
    
    if (!movie) {
      throw new Error('Movie not found');
    }

    await this.eventBus.publish(EVENTS.MOVIE_UPDATED, {
      movieId: movie._id,
      updates: Object.keys(updates)
    });

    return movie;
  }

  /**
   * Delete Movie
   */
  async deleteMovie(id: string): Promise<void> {
    const movie = await Movie.findByIdAndDelete(id);

    if (!movie) {
      throw new Error('Movie not found');
    }

    await this.eventBus.publish(EVENTS.MOVIE_DELETED, {
      movieId: movie._id,
      cloudinaryPublicId: movie.cloudinaryPublicId
    });
  }

  /**
   * Get Subtitles
   */
  async getSubtitles(id: string): Promise<any> {
    const movie = await Movie.findById(id).select('subtitles title');
    
    if (!movie) {
      throw new Error('Movie not found');
    }

    return {
      movie: movie.title,
      subtitles: movie.subtitles
    };
  }
}