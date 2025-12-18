import { config } from './config';
import { connectDatabase, disconnectDatabase } from './config/database';
import { disconnectRedis } from './config/redis';
import { createApp } from './app';
import { EventBus, retry } from '@streamia/shared';

async function bootstrap(): Promise<void> {
  console.log(`[${config.serviceName}] Starting service...`);

  // Create event bus
  const eventBus = new EventBus({
    url: config.rabbitmqUrl,
    serviceName: config.serviceName,
  });

  try {
    // Connect to MongoDB with retry
    await retry(() => connectDatabase(), {
      maxRetries: 5,
      delay: 2000,
      backoff: 2,
    });

    // Connect to RabbitMQ with retry
    await retry(() => eventBus.connect(), {
      maxRetries: 5,
      delay: 2000,
      backoff: 2,
    });

    // Create and start Express app
    const app = createApp(eventBus);

    const server = app.listen(config.port, () => {
      console.log(`[${config.serviceName}] Server running on port ${config.port}`);
      console.log(`[${config.serviceName}] Environment: ${config.nodeEnv}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[${config.serviceName}] Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        console.log(`[${config.serviceName}] HTTP server closed`);

        await Promise.all([
          disconnectDatabase(),
          disconnectRedis(),
          eventBus.disconnect(),
        ]);

        console.log(`[${config.serviceName}] All connections closed`);
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        console.error(`[${config.serviceName}] Forced shutdown after timeout`);
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error(`[${config.serviceName}] Failed to start service:`, error);
    process.exit(1);
  }
}

bootstrap();
