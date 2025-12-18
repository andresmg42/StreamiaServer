import { Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { apiResponse, errorResponse, asyncHandler } from '@streamia/shared';
import { MovieService } from '../services';

// Define types for Multer callbacks
type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;

/**
 * Multer configuration for temporary file uploads
 */
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: DestinationCallback) => {
    // Ensure uploads directory exists or handle via docker volume
    cb(null, 'uploads/');
  },
  filename: (req: Request, file: Express.Multer.File, cb: FileNameCallback) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadMiddleware = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for videos
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.fieldname === 'video') {
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (videoExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed (MP4, MOV, AVI, MKV, WEBM)'));
      }
    } else if (file.fieldname === 'subtitle') {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.vtt' || ext === '.srt') {
        cb(null, true);
      } else {
        cb(new Error('Only subtitle files are allowed (VTT, SRT)'));
      }
    } else {
      cb(new Error('Invalid file field'));
    }
  }
});

export class MovieController {
  private movieService: MovieService;

  constructor(movieService: MovieService) {
    this.movieService = movieService;
  }

  /**
   * POST /api/movies/upload
   */
  uploadMovie = asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return errorResponse(res, 400, 'No video file provided');
      }

      const movie = await this.movieService.createMovie(req.file.path, req.body);

      return apiResponse(res, 201, movie, 'Movie uploaded successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error uploading movie';
      return errorResponse(res, 500, message);
    }
  });

  /**
   * POST /api/movies/:id/subtitles
   */
  uploadSubtitles = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { language, label } = req.body;

      if (!req.file) {
        return errorResponse(res, 400, 'No subtitle file provided');
      }
      if (!language || !label) {
        return errorResponse(res, 400, 'Language and label are required');
      }

      const movie = await this.movieService.addSubtitle(id, req.file.path, { language, label });

      return apiResponse(res, 200, movie.subtitles, 'Subtitles uploaded successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error uploading subtitles';
      return errorResponse(res, message === 'Movie not found' ? 404 : 500, message);
    }
  });

  /**
   * GET /api/movies
   */
  getMovies = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { category, search } = req.query;
      
      const movies = await this.movieService.getMovies({
        category: category as string,
        search: search as string
      });

      if (movies.length === 0) {
        return apiResponse(
          res, 
          200, 
          movies, 
          search ? "No movies found matching your search" : "No movies available"
        );
      }

      return apiResponse(res, 200, movies);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error getting movies';
      return errorResponse(res, 500, message);
    }
  });

  /**
   * GET /api/movies/:id
   */
  getMovieById = asyncHandler(async (req: Request, res: Response) => {
    try {
      const movie = await this.movieService.getMovieById(req.params.id);
      return apiResponse(res, 200, movie);
    } catch (error) {
      return errorResponse(res, 404, 'Movie not found');
    }
  });

  /**
   * PUT /api/movies/:id
   */
  updateMovie = asyncHandler(async (req: Request, res: Response) => {
    try {
      const movie = await this.movieService.updateMovie(req.params.id, req.body);
      return apiResponse(res, 200, movie, 'Movie updated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error updating movie';
      return errorResponse(res, message === 'Movie not found' ? 404 : 500, message);
    }
  });

  /**
   * DELETE /api/movies/:id
   */
  deleteMovie = asyncHandler(async (req: Request, res: Response) => {
    try {
      await this.movieService.deleteMovie(req.params.id);
      return apiResponse(res, 200, null, 'Movie deleted successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error deleting movie';
      return errorResponse(res, message === 'Movie not found' ? 404 : 500, message);
    }
  });

  /**
   * GET /api/movies/:id/subtitles
   */
  getMovieSubtitles = asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = await this.movieService.getSubtitles(req.params.id);
      return apiResponse(res, 200, data);
    } catch (error) {
      return errorResponse(res, 404, 'Movie not found');
    }
  });
}