import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authMiddleware, getCircuitBreakerStatus } from './middlewares';
import { createProxyRoutes } from './routes';

export function createApp(): Application {
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
    message: {
      success: false,
      error: 'Too Many Requests',
      message: 'Too many requests, please try again later',
    },
  });
  app.use(limiter);

  // Logging
  if (config.nodeEnv !== 'test') {
    app.use(morgan('combined'));
  }

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    });
  });

  // Circuit breaker status endpoint (for monitoring)
  app.get('/health/circuit-breakers', (_req, res) => {
    res.json(getCircuitBreakerStatus());
  });

  // Authentication middleware
  app.use(authMiddleware);

  // Proxy routes
  app.use('/api/v1', createProxyRoutes());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Gateway error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: config.nodeEnv === 'development' ? err.message : 'An unexpected error occurred',
    });
  });

  return app;
}
