import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '@streamia/shared';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  errorResponse(res, statusCode, message);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  errorResponse(res, 404, 'Not Found', `Route ${req.originalUrl} not found`);
}
