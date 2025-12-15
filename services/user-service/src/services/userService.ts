import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { User, IUser } from '../models';
import { EventBus, EVENTS } from '@streamia/shared';
import { setCache, getCache, deleteCache } from '../config/redis';
import {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  RefreshTokenInput,
} from '../validators';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JWTPayload {
  userId: string;
  email: string;
}

export class UserService {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Register a new user
   */
  async register(data: RegisterInput): Promise<{ user: IUser; tokens: TokenPair }> {
    // Check if email already exists
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Create user
    const user = new User({
      email: data.email,
      username: data.username,
      password: data.password,
    });

    await user.save();

    // Generate tokens
    const tokens = await this.generateTokenPair(user);

    // Publish user registered event
    await this.eventBus.publish(EVENTS.USER_REGISTERED, {
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
    });

    // Also send welcome email notification
    await this.eventBus.publish(EVENTS.NOTIFICATION_SEND_EMAIL, {
      to: user.email,
      subject: 'Welcome to Streamia!',
      template: 'welcome',
      data: {
        username: user.username,
      },
    });

    return { user, tokens };
  }

  /**
   * Login user
   */
  async login(data: LoginInput): Promise<{ user: IUser; tokens: TokenPair }> {
    const user = await User.findOne({ email: data.email });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await user.comparePassword(data.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const tokens = await this.generateTokenPair(user);

    return { user, tokens };
  }

  /**
   * Logout user (invalidate refresh token)
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: refreshToken },
    });

    // Invalidate cache
    await deleteCache(`user:${userId}`);
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<IUser> {
    // Try to get from cache
    const cached = await getCache<IUser>(`user:${userId}`);
    if (cached) {
      return cached;
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Cache for 5 minutes
    await setCache(`user:${userId}`, user.toJSON(), 300);

    return user;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileInput): Promise<IUser> {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    // Invalidate cache
    await deleteCache(`user:${userId}`);

    // Publish user updated event
    await this.eventBus.publish(EVENTS.USER_UPDATED, {
      userId: user._id.toString(),
      changes: data,
    });

    return user;
  }

  /**
   * Delete user account
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    // Invalidate cache
    await deleteCache(`user:${userId}`);

    // Publish user deleted event (triggers saga for cleanup)
    await this.eventBus.publish(EVENTS.USER_DELETED, {
      userId: user._id.toString(),
      email: user.email,
    });

    // Send account deletion email
    await this.eventBus.publish(EVENTS.NOTIFICATION_SEND_EMAIL, {
      to: user.email,
      subject: 'Account Deleted - Streamia',
      template: 'account_deleted',
      data: {
        username: user.username,
      },
    });
  }

  /**
   * Request password reset
   */
  async forgotPassword(data: ForgotPasswordInput): Promise<void> {
    const user = await User.findOne({ email: data.email });
    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token to user
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Publish password reset requested event
    await this.eventBus.publish(EVENTS.USER_PASSWORD_RESET_REQUESTED, {
      userId: user._id.toString(),
      email: user.email,
      resetToken,
    });

    // Send password reset email
    await this.eventBus.publish(EVENTS.NOTIFICATION_SEND_EMAIL, {
      to: user.email,
      subject: 'Password Reset - Streamia',
      template: 'password_reset',
      data: {
        username: user.username,
        resetToken,
        resetUrl: `${config.corsOrigin}/reset-password?token=${resetToken}`,
      },
    });
  }

  /**
   * Reset password
   */
  async resetPassword(data: ResetPasswordInput): Promise<void> {
    const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Update password
    user.password = data.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshTokens = []; // Invalidate all sessions
    await user.save();

    // Publish password reset completed event
    await this.eventBus.publish(EVENTS.USER_PASSWORD_RESET_COMPLETED, {
      userId: user._id.toString(),
      email: user.email,
    });
  }

  /**
   * Refresh access token
   */
  async refreshToken(data: RefreshTokenInput): Promise<TokenPair> {
    try {
      const payload = jwt.verify(data.refreshToken, config.jwt.refreshSecret) as JWTPayload;

      const user = await User.findById(payload.userId);
      if (!user || !user.refreshTokens.includes(data.refreshToken)) {
        throw new Error('Invalid refresh token');
      }

      // Remove old refresh token
      user.refreshTokens = user.refreshTokens.filter((t) => t !== data.refreshToken);

      // Generate new tokens
      const tokens = await this.generateTokenPair(user);

      return tokens;
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JWTPayload;
    } catch {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokenPair(user: IUser): Promise<TokenPair> {
    const payload: JWTPayload = {
      userId: user._id.toString(),
      email: user.email,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    // Store refresh token
    user.refreshTokens.push(refreshToken);

    // Limit stored refresh tokens (max 5 sessions)
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    return { accessToken, refreshToken };
  }
}
