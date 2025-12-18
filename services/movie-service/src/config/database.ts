import mongoose from 'mongoose';
import { config } from './index';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log(`[${config.serviceName}] Connected to MongoDB`);

    mongoose.connection.on('error', (err) => {
      console.error(`[${config.serviceName}] MongoDB connection error:`, err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn(`[${config.serviceName}] MongoDB disconnected`);
    });
  } catch (error) {
    console.error(`[${config.serviceName}] Failed to connect to MongoDB:`, error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log(`[${config.serviceName}] Disconnected from MongoDB`);
  } catch (error) {
    console.error(`[${config.serviceName}] Error disconnecting from MongoDB:`, error);
  }
}
