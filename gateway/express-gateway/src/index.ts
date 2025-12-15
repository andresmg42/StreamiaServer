import { config } from './config';
import { createApp } from './app';

async function bootstrap(): Promise<void> {
  console.log('[api-gateway] Starting API Gateway...');

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`[api-gateway] API Gateway running on port ${config.port}`);
    console.log(`[api-gateway] Environment: ${config.nodeEnv}`);
    console.log('[api-gateway] Service routes:');
    console.log(`  - User Service: ${config.services.user}`);
    console.log(`  - Movie Service: ${config.services.movie}`);
    console.log(`  - Favorites Service: ${config.services.favorites}`);
    console.log(`  - Rating Service: ${config.services.rating}`);
    console.log(`  - Comment Service: ${config.services.comment}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[api-gateway] Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      console.log('[api-gateway] HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[api-gateway] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('[api-gateway] Failed to start:', error);
  process.exit(1);
});
