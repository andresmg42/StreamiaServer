import { Router, Request, Response } from 'express';
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
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
    on: {
      // Handle errors for both HTTP responses and Sockets
      error: (err: Error, _req: IncomingMessage, res: ServerResponse | Socket) => {
        console.error(`[Proxy Error] ${serviceName}:`, err.message);

        // Check if 'res' is an HTTP response (has 'statusCode')
        const isHttpResponse = 'statusCode' in res;

        if (isHttpResponse) {
          // Safe to cast to Express Response
          const expressRes = res as unknown as Response;

          if (!expressRes.headersSent) {
            expressRes.status(502).json({
              success: false,
              error: 'Bad Gateway',
              message: `Failed to connect to ${serviceName}`,
            });
          }
        } else {
          // If it's a Socket error (e.g. WebSocket failure), just end it
          res.end();
        }
      },
      // Handle request proxying
      proxyReq: (proxyReq: ClientRequest, req: IncomingMessage) => {
        // Cast to 'any' to access custom middleware properties
        const expressReq = req as any;

        // Forward authentication headers
        if (expressReq.userId) {
          proxyReq.setHeader('x-user-id', expressReq.userId);
        }
        if (expressReq.userEmail) {
          proxyReq.setHeader('x-user-email', expressReq.userEmail);
        }
      },
    },
    // FIX: 'logLevel' removed (incompatible with v3)
  };
}

export function createProxyRoutes(): Router {
  const router = Router();

  // User Service
  router.use(
    '/auth',
    circuitBreakerMiddleware('user-service'),
    createProxyMiddleware({
      ...createProxyOptions(config.services.user, 'users'),
      pathRewrite: { '^': '/api/v1/auth' },
    })
  );

  router.use(
    '/users',
    circuitBreakerMiddleware('user-service'),
    createProxyMiddleware({
      ...createProxyOptions(config.services.user, 'users'),
      pathRewrite: { '^': '/api/v1/users' },
    })
  );

  // Movie Service
  router.use(
    '/movies',
    circuitBreakerMiddleware('movie-service'),
    createProxyMiddleware({...createProxyOptions(config.services.movie, 'movies'),
      pathRewrite: { '^': '/api/v1/movies' }
    }),
    
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
    createProxyMiddleware({...createProxyOptions(config.services.rating, 'ratings'),
      pathRewrite: { '^': '/api/v1/ratings' }
    }),
  );

  // Comment Service
  router.use(
    '/comments',
    circuitBreakerMiddleware('comment-service'),
    createProxyMiddleware(createProxyOptions(config.services.comment, 'comments'))
  );

  return router;
}