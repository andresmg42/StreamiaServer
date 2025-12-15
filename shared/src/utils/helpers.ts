import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

/**
 * Standard API response helper
 */
export function apiResponse<T>(
  res: Response,
  statusCode: number,
  data?: T,
  message?: string
): Response {
  const response: ApiResponse<T> = {
    success: statusCode >= 200 && statusCode < 300,
    data,
    message,
  };
  return res.status(statusCode).json(response);
}

/**
 * Error response helper
 */
export function errorResponse(
  res: Response,
  statusCode: number,
  error: string,
  message?: string
): Response {
  const response: ApiResponse = {
    success: false,
    error,
    message,
  };
  return res.status(statusCode).json(response);
}

/**
 * Async handler wrapper for Express routes
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Sleep helper for retries
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry helper for operations that might fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number; backoff?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = 2 } = options;

  let lastError: Error | undefined;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        await sleep(currentDelay);
        currentDelay *= backoff;
      }
    }
  }

  throw lastError;
}
