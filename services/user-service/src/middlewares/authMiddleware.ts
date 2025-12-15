import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '@streamia/shared';
import { UserService } from '../services';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export function authMiddleware(userService: UserService) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse(res, 401, 'Unauthorized', 'No token provided');
      }

      const token = authHeader.split(' ')[1];
      const payload = userService.verifyAccessToken(token);

      req.userId = payload.userId;
      req.userEmail = payload.email;

      next();
    } catch (error) {
      return errorResponse(res, 401, 'Unauthorized', 'Invalid token');
    }
  };
}
