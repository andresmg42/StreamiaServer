import { Router } from 'express';
import { MovieController, uploadMiddleware } from '../controllers/movieController';
import { MovieService } from '../services';

export function createMovieRoutes(movieService: MovieService): Router {
  const router = Router();
  const controller = new MovieController(movieService);

  // -- Public Routes --

  /**
   * @route   GET /movies
   * @desc    Get all movies or explore with filters (merged endpoint)
   */
  router.get('/movies', controller.getMovies);

  /**
   * @route   GET /movies/:id
   * @desc    Get movie by ID
   */
  router.get('/movies/:id', controller.getMovieById);

  /**
   * @route   GET /movies/:id/subtitles
   * @desc    Get all subtitles for a movie
   */
  router.get('/movies/:id/subtitles', controller.getMovieSubtitles);


  // -- Protected Routes (Auth handled by Gateway) --

  /**
   * @route   POST /movies/upload
   * @desc    Upload a movie to Cloudinary
   */
  router.post(
    '/movies/upload', 
    uploadMiddleware.single('video'), 
    controller.uploadMovie
  );

  /**
   * @route   POST /movies/:id/subtitles
   * @desc    Upload subtitles for a movie
   */
  router.post(
    '/movies/:id/subtitles', 
    uploadMiddleware.single('subtitle'), 
    controller.uploadSubtitles
  );

  /**
   * @route   PUT /movies/:id
   * @desc    Update a movie
   */
  router.put('/movies/:id', controller.updateMovie);

  /**
   * @route   DELETE /movies/:id
   * @desc    Delete a movie
   */
  router.delete('/movies/:id', controller.deleteMovie);

  return router;
}