// Event names for the choreography pattern
export const EVENTS = {
  // User Events
  USER_REGISTERED: 'user.registered',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  USER_PASSWORD_RESET_COMPLETED: 'user.password_reset_completed',

  // Movie Events
  MOVIE_CREATED: 'movie.created',
  MOVIE_UPDATED: 'movie.updated',
  MOVIE_DELETED: 'movie.deleted',
  MOVIE_VIDEO_UPLOADED: 'movie.video_uploaded',

  // Favorites Events
  FAVORITE_ADDED: 'favorite.added',
  FAVORITE_REMOVED: 'favorite.removed',
  FAVORITES_CLEARED_FOR_USER: 'favorites.cleared_for_user',
  FAVORITES_CLEARED_FOR_MOVIE: 'favorites.cleared_for_movie',

  // Rating Events
  RATING_CREATED: 'rating.created',
  RATING_UPDATED: 'rating.updated',
  RATING_DELETED: 'rating.deleted',
  RATINGS_CLEARED_FOR_USER: 'ratings.cleared_for_user',
  RATINGS_CLEARED_FOR_MOVIE: 'ratings.cleared_for_movie',

  // Comment Events
  COMMENT_CREATED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_DELETED: 'comment.deleted',
  COMMENTS_CLEARED_FOR_USER: 'comments.cleared_for_user',
  COMMENTS_CLEARED_FOR_MOVIE: 'comments.cleared_for_movie',

  // Notification Events
  NOTIFICATION_SEND_EMAIL: 'notification.send_email',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// Exchange names
export const EXCHANGES = {
  USER_EVENTS: 'user.events',
  MOVIE_EVENTS: 'movie.events',
  FAVORITES_EVENTS: 'favorites.events',
  RATING_EVENTS: 'rating.events',
  COMMENT_EVENTS: 'comment.events',
  NOTIFICATION_EVENTS: 'notification.events',
} as const;

// Queue names
export const QUEUES = {
  // User-related queues
  FAVORITES_USER_QUEUE: 'favorites.user.queue',
  RATINGS_USER_QUEUE: 'ratings.user.queue',
  COMMENTS_USER_QUEUE: 'comments.user.queue',
  NOTIFICATIONS_USER_QUEUE: 'notifications.user.queue',

  // Movie-related queues
  FAVORITES_MOVIE_QUEUE: 'favorites.movie.queue',
  RATINGS_MOVIE_QUEUE: 'ratings.movie.queue',
  COMMENTS_MOVIE_QUEUE: 'comments.movie.queue',

  // Notification queues
  NOTIFICATIONS_QUEUE: 'notifications.queue',
} as const;
