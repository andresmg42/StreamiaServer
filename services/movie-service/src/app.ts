import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { createMovieRoutes } from './routes';
import { MovieService } from './services';
import { errorHandler, notFoundHandler } from './middlewares';
import { EventBus } from '@streamia/shared';

export function createApp(eventBus: EventBus): Application {
  const app = express();

  // Initialize Services
  const movieService = new MovieService(eventBus);

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { success: false, error: 'Too many requests, please try again later' },
  });
  app.use(limiter);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging
  if (config.nodeEnv !== 'test') {
    app.use(morgan('combined'));
  }

  // Health check endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'movie-service' });
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'live' });
  });

  app.get('/health/ready', (_req, res) => {
    // Check if all dependencies are ready (e.g. RabbitMQ)
    const isReady = eventBus.isReady(); // Assuming isReady() exists on your EventBus
    if (isReady) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  });

  // Mount Routes
  // Note: We mount at '/' because the routes in movieRoutes.ts already define paths like '/movies'
  app.use('/api/v1', createMovieRoutes(movieService));

  // 404 Handler
  app.use(notFoundHandler);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}