import { Router } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { config } from '../config';
import { circuitBreakerMiddleware } from '../middlewares';

// Proxy options factory
function createProxyOptions(target: string, serviceName: string): Options {
  return {
    target,
    changeOrigin: true,
    pathRewrite: {
      [`^/api/v1/${serviceName}`]: '/api/v1',
    },
    onError: (err, _req, res) => {
      console.error(`[Proxy Error] ${serviceName}:`, err.message);
      if (!res.headersSent) {
        (res as any).status(502).json({
          success: false,
          error: 'Bad Gateway',
          message: `Failed to connect to ${serviceName}`,
        });
      }
    },
    onProxyReq: (proxyReq, req) => {
      // Forward authentication headers
      if ((req as any).userId) {
        proxyReq.setHeader('x-user-id', (req as any).userId);
      }
      if ((req as any).userEmail) {
        proxyReq.setHeader('x-user-email', (req as any).userEmail);
      }
    },
    logLevel: config.nodeEnv === 'development' ? 'debug' : 'warn',
  };
}

export function createProxyRoutes(): Router {
  const router = Router();

  // User Service - handles auth and user management
  router.use(
    '/auth',
    circuitBreakerMiddleware('user-service'),
    createProxyMiddleware({
      ...createProxyOptions(config.services.user, 'users'),
      pathRewrite: { '^/api/v1/auth': '/api/v1/auth' },
    })
  );

  router.use(
    '/users',
    circuitBreakerMiddleware('user-service'),
    createProxyMiddleware({
      ...createProxyOptions(config.services.user, 'users'),
      pathRewrite: { '^/api/v1/users': '/api/v1/users' },
    })
  );

  // Movie Service
  router.use(
    '/movies',
    circuitBreakerMiddleware('movie-service'),
    createProxyMiddleware(createProxyOptions(config.services.movie, 'movies'))
  );

  // Favorites Service
  router.use(
    '/favorites',
    circuitBreakerMiddleware('favorites-service'),
    createProxyMiddleware(createProxyOptions(config.services.favorites, 'favorites'))
  );

  // Rating Service
  router.use(
    '/ratings',
    circuitBreakerMiddleware('rating-service'),
    createProxyMiddleware(createProxyOptions(config.services.rating, 'ratings'))
  );

  // Comment Service
  router.use(
    '/comments',
    circuitBreakerMiddleware('comment-service'),
    createProxyMiddleware(createProxyOptions(config.services.comment, 'comments'))
  );

  return router;
}
