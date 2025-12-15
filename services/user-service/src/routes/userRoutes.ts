import { Router } from 'express';
import { UserController } from '../controllers';
import { UserService } from '../services';
import { authMiddleware, validate } from '../middlewares';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from '../validators';

export function createUserRoutes(userService: UserService): Router {
  const router = Router();
  const controller = new UserController(userService);
  const auth = authMiddleware(userService);

  // Auth routes (public)
  router.post('/auth/register', validate(registerSchema), controller.register);
  router.post('/auth/login', validate(loginSchema), controller.login);
  router.post('/auth/refresh', validate(refreshTokenSchema), controller.refreshToken);
  router.post('/auth/forgot-password', validate(forgotPasswordSchema), controller.forgotPassword);
  router.post('/auth/reset-password', validate(resetPasswordSchema), controller.resetPassword);

  // Auth routes (protected)
  router.post('/auth/logout', auth, controller.logout);

  // User routes (protected)
  router.get('/users/profile', auth, controller.getProfile);
  router.put('/users/profile', auth, validate(updateProfileSchema), controller.updateProfile);
  router.delete('/users/account', auth, controller.deleteAccount);

  return router;
}
