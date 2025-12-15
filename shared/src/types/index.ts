// User Types
export interface User {
  id: string;
  email: string;
  username: string;
  password?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  username: string;
  password: string;
}

export interface UpdateUserDTO {
  username?: string;
  avatar?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

// Movie Types
export interface Movie {
  id: string;
  title: string;
  description: string;
  releaseYear: number;
  duration: number;
  genre: string[];
  director: string;
  cast: string[];
  posterUrl?: string;
  videoUrl?: string;
  subtitles?: Subtitle[];
  averageRating: number;
  totalRatings: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subtitle {
  language: string;
  url: string;
}

export interface CreateMovieDTO {
  title: string;
  description: string;
  releaseYear: number;
  duration: number;
  genre: string[];
  director: string;
  cast: string[];
}

// Favorites Types
export interface Favorite {
  id: string;
  userId: string;
  movieId: string;
  note?: string;
  createdAt: Date;
}

export interface CreateFavoriteDTO {
  movieId: string;
  note?: string;
}

// Rating Types
export interface Rating {
  id: string;
  userId: string;
  movieId: string;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRatingDTO {
  movieId: string;
  score: number;
}

// Comment Types
export interface Comment {
  id: string;
  userId: string;
  movieId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommentDTO {
  movieId: string;
  content: string;
}

export interface UpdateCommentDTO {
  content: string;
}

// Pagination Types
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}
