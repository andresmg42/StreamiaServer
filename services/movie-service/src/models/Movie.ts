/**
 * @file Movie.ts
 * @description Mongoose model and interfaces for Movie entity.
 * Handles movie data storage with Cloudinary integration and subtitle support.
 * @author Streamia Team
 * @version 1.0.0
 * @created 2025-10-26
 * 
 * @module Models/Movie
 */

import mongoose, { Document, Schema } from "mongoose";

/**
 * Interface representing a subtitle track for a movie
 * @interface ISubtitle
 * @property {string} language - ISO language code (e.g., 'es', 'en', 'fr')
 * @property {string} url - Cloudinary URL for the subtitle file
 * @property {string} label - Display label for the subtitle (e.g., 'Español', 'English')
 */
export interface ISubtitle {
  language: string;
  url: string;
  label: string;
}

/**
 * Interface representing a Movie document in MongoDB
 * @interface IMovie
 * @extends {Document}
 * @property {string} title - Movie title (required)
 * @property {string} [description] - Movie description
 * @property {string} [category] - Movie category/genre
 * @property {string} [coverImage] - URL for movie cover image
 * @property {string} [videoUrl] - Cloudinary URL for the video file
 * @property {string} [cloudinaryPublicId] - Unique identifier in Cloudinary
 * @property {string} [videoFormat] - Video format (mp4, webm, etc.)
 * @property {boolean} hasAudio - Indicates if video has audio
 * @property {ISubtitle[]} subtitles - Array of subtitle tracks
 * @property {string} [externalId] - Legacy external provider ID
 * @property {number} [duration] - Video duration in seconds
 * @property {string} [provider] - Content provider ('cloudinary')
 * @property {Date} createdAt - Document creation timestamp
 * @property {Date} updatedAt - Document last update timestamp
 */
export interface IMovie extends Document {
  title: string;
  description?: string;
  category?: string;
  coverImage?: string;
  videoUrl?: string;
  cloudinaryPublicId?: string;
  videoFormat?: string;
  hasAudio: boolean;
  subtitles: ISubtitle[];
  externalId?: string;
  duration?: number;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose schema definition for Movie collection
 * @constant {Schema} movieSchema
 */
const movieSchema = new Schema<IMovie>(
  {
    title: { 
      type: String, 
      required: [true, 'Movie title is required'], 
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: { 
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    category: { 
      type: String,
      trim: true
    },
    coverImage: { 
      type: String
    },
    videoUrl: { 
      type: String
    },
    cloudinaryPublicId: { 
      type: String,
      trim: true
    },
    videoFormat: { 
      type: String
    },
    hasAudio: { 
      type: Boolean, 
      default: true 
    },
    subtitles: [{
      language: { 
        type: String, 
        required: [true, 'Subtitle language is required']
      },
      url: { 
        type: String, 
        required: [true, 'Subtitle URL is required']
      },
      label: { 
        type: String, 
        required: [true, 'Subtitle label is required']
      }
    }],
    externalId: { 
      type: String, 
      index: true 
    },
    duration: { 
      type: Number,
      min: [1, 'Duration must be at least 1 second']
    },
    provider: { 
      type: String, 
      default: "cloudinary"
    },
  },
  { 
    timestamps: true
  }
);

/**
 * Movie model instance
 * Returns existing model or creates new one if it doesn't exist
 * @constant {Model<IMovie>} Movie
 */
export const Movie = mongoose.models.Movie || mongoose.model<IMovie>("Movie", movieSchema);
export default Movie;