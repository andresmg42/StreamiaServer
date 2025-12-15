import { EventName } from './constants';

// Base Event Interface
export interface BaseEvent {
  eventId: string;
  eventName: EventName;
  timestamp: Date;
  correlationId?: string;
}

// User Events
export interface UserRegisteredEvent extends BaseEvent {
  eventName: 'user.registered';
  payload: {
    userId: string;
    email: string;
    username: string;
  };
}

export interface UserUpdatedEvent extends BaseEvent {
  eventName: 'user.updated';
  payload: {
    userId: string;
    changes: {
      username?: string;
      avatar?: string;
    };
  };
}

export interface UserDeletedEvent extends BaseEvent {
  eventName: 'user.deleted';
  payload: {
    userId: string;
    email: string;
  };
}

export interface UserPasswordResetRequestedEvent extends BaseEvent {
  eventName: 'user.password_reset_requested';
  payload: {
    userId: string;
    email: string;
    resetToken: string;
  };
}

export interface UserPasswordResetCompletedEvent extends BaseEvent {
  eventName: 'user.password_reset_completed';
  payload: {
    userId: string;
    email: string;
  };
}

// Movie Events
export interface MovieCreatedEvent extends BaseEvent {
  eventName: 'movie.created';
  payload: {
    movieId: string;
    title: string;
  };
}

export interface MovieUpdatedEvent extends BaseEvent {
  eventName: 'movie.updated';
  payload: {
    movieId: string;
    title: string;
  };
}

export interface MovieDeletedEvent extends BaseEvent {
  eventName: 'movie.deleted';
  payload: {
    movieId: string;
    title: string;
  };
}

// Favorites Events
export interface FavoriteAddedEvent extends BaseEvent {
  eventName: 'favorite.added';
  payload: {
    userId: string;
    movieId: string;
  };
}

export interface FavoriteRemovedEvent extends BaseEvent {
  eventName: 'favorite.removed';
  payload: {
    userId: string;
    movieId: string;
  };
}

// Rating Events
export interface RatingCreatedEvent extends BaseEvent {
  eventName: 'rating.created';
  payload: {
    userId: string;
    movieId: string;
    score: number;
  };
}

export interface RatingUpdatedEvent extends BaseEvent {
  eventName: 'rating.updated';
  payload: {
    userId: string;
    movieId: string;
    oldScore: number;
    newScore: number;
  };
}

// Comment Events
export interface CommentCreatedEvent extends BaseEvent {
  eventName: 'comment.created';
  payload: {
    commentId: string;
    userId: string;
    movieId: string;
  };
}

export interface CommentDeletedEvent extends BaseEvent {
  eventName: 'comment.deleted';
  payload: {
    commentId: string;
    userId: string;
    movieId: string;
  };
}

// Notification Events
export interface SendEmailEvent extends BaseEvent {
  eventName: 'notification.send_email';
  payload: {
    to: string;
    subject: string;
    template: 'welcome' | 'password_reset' | 'account_deleted';
    data: Record<string, unknown>;
  };
}

// Union type of all events
export type StreamiaEvent =
  | UserRegisteredEvent
  | UserUpdatedEvent
  | UserDeletedEvent
  | UserPasswordResetRequestedEvent
  | UserPasswordResetCompletedEvent
  | MovieCreatedEvent
  | MovieUpdatedEvent
  | MovieDeletedEvent
  | FavoriteAddedEvent
  | FavoriteRemovedEvent
  | RatingCreatedEvent
  | RatingUpdatedEvent
  | CommentCreatedEvent
  | CommentDeletedEvent
  | SendEmailEvent;

// Event type map for type-safe event handling
export interface EventTypeMap {
  'user.registered': UserRegisteredEvent;
  'user.updated': UserUpdatedEvent;
  'user.deleted': UserDeletedEvent;
  'user.password_reset_requested': UserPasswordResetRequestedEvent;
  'user.password_reset_completed': UserPasswordResetCompletedEvent;
  'movie.created': MovieCreatedEvent;
  'movie.updated': MovieUpdatedEvent;
  'movie.deleted': MovieDeletedEvent;
  'favorite.added': FavoriteAddedEvent;
  'favorite.removed': FavoriteRemovedEvent;
  'rating.created': RatingCreatedEvent;
  'rating.updated': RatingUpdatedEvent;
  'comment.created': CommentCreatedEvent;
  'comment.deleted': CommentDeletedEvent;
  'notification.send_email': SendEmailEvent;
}
