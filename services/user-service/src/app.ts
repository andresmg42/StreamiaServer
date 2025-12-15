import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { createUserRoutes } from './routes';
import { UserService } from './services';
import { errorHandler, notFoundHandler } from './middlewares';
import { EventBus } from '@streamia/shared';

export function createApp(eventBus: EventBus): Application {
  const app = express();

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
    res.json({ status: 'ok', service: config.serviceName });
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'live' });
  });

  app.get('/health/ready', (_req, res) => {
    // Check if all dependencies are ready
    const isReady = eventBus.isReady();
    if (isReady) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  });

  // Create service instance
  const userService = new UserService(eventBus);

  // API routes
  app.use('/api/v1', createUserRoutes(userService));

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
