import { Request, Response } from 'express';
import { apiResponse, errorResponse, asyncHandler } from '@streamia/shared';
import { UserService } from '../services';

export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * POST /auth/register
   */
  register = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { user, tokens } = await this.userService.register(req.body);

      return apiResponse(
        res,
        201,
        {
          user: user.toJSON(),
          ...tokens,
        },
        'User registered successfully'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      return errorResponse(res, 400, message);
    }
  });

  /**
   * POST /auth/login
   */
  login = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { user, tokens } = await this.userService.login(req.body);

      return apiResponse(
        res,
        200,
        {
          user: user.toJSON(),
          ...tokens,
        },
        'Login successful'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return errorResponse(res, 401, message);
    }
  });

  /**
   * POST /auth/logout
   */
  logout = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      await this.userService.logout(req.userId!, refreshToken);

      return apiResponse(res, 200, null, 'Logout successful');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      return errorResponse(res, 400, message);
    }
  });

  /**
   * POST /auth/refresh
   */
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    try {
      const tokens = await this.userService.refreshToken(req.body);

      return apiResponse(res, 200, tokens, 'Token refreshed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      return errorResponse(res, 401, message);
    }
  });

  /**
   * POST /auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    try {
      await this.userService.forgotPassword(req.body);

      return apiResponse(
        res,
        200,
        null,
        'If an account exists with this email, a password reset link will be sent'
      );
    } catch (error) {
      // Don't reveal errors to prevent email enumeration
      return apiResponse(
        res,
        200,
        null,
        'If an account exists with this email, a password reset link will be sent'
      );
    }
  });

  /**
   * POST /auth/reset-password
   */
  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    try {
      await this.userService.resetPassword(req.body);

      return apiResponse(res, 200, null, 'Password reset successful');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';
      return errorResponse(res, 400, message);
    }
  });

  /**
   * GET /users/profile
   */
  getProfile = asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = await this.userService.getProfile(req.userId!);

      return apiResponse(res, 200, user.toJSON());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get profile';
      return errorResponse(res, 404, message);
    }
  });

  /**
   * PUT /users/profile
   */
  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = await this.userService.updateProfile(req.userId!, req.body);

      return apiResponse(res, 200, user.toJSON(), 'Profile updated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      return errorResponse(res, 400, message);
    }
  });

  /**
   * DELETE /users/account
   */
  deleteAccount = asyncHandler(async (req: Request, res: Response) => {
    try {
      await this.userService.deleteAccount(req.userId!);

      return apiResponse(res, 200, null, 'Account deleted successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete account';
      return errorResponse(res, 400, message);
    }
  });
}
