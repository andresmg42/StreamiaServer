import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

interface JWTPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

// Routes that don't require authentication
const publicRoutes = [
  { path: '/api/v1/auth/register', method: 'POST' },
  { path: '/api/v1/auth/login', method: 'POST' },
  { path: '/api/v1/auth/refresh', method: 'POST' },
  { path: '/api/v1/auth/forgot-password', method: 'POST' },
  { path: '/api/v1/auth/reset-password', method: 'POST' },
  { path: '/api/v1/movies', method: 'GET' },
  { path: /^\/api\/v1\/movies\/[^/]+$/, method: 'GET' },
  { path: '/health', method: 'GET' },
];

function isPublicRoute(path: string, method: string): boolean {
  return publicRoutes.some((route) => {
    const pathMatch = route.path instanceof RegExp 
      ? route.path.test(path) 
      : route.path === path;
    return pathMatch && route.method === method;
  });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if route is public
  if (isPublicRoute(req.path, req.method)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'No token provided',
    });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;

    req.userId = payload.userId;
    req.userEmail = payload.email;

    // Forward user info to downstream services
    req.headers['x-user-id'] = payload.userId;
    req.headers['x-user-email'] = payload.email;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid token',
    });
  }
}
