import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { EventName, EXCHANGES } from './constants';
import { BaseEvent, StreamiaEvent } from './types';

export interface EventBusConfig {
  url: string;
  serviceName: string;
}

export type EventHandler<T = StreamiaEvent> = (event: T) => Promise<void>;

/**
 * EventBus - Handles RabbitMQ messaging for choreography pattern
 * Each microservice creates an instance of this class to publish and subscribe to events
 */
export class EventBus {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private config: EventBusConfig;
  private handlers: Map<string, EventHandler<unknown>[]> = new Map();
  private isConnectedFlag = false;

  constructor(config: EventBusConfig) {
    this.config = config;
  }

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    try {
      const conn = await amqp.connect(this.config.url);
      this.connection = conn;
      this.channel = await conn.createChannel();

      // Set up exchanges for all event types
      for (const exchange of Object.values(EXCHANGES)) {
        await this.channel.assertExchange(exchange, 'topic', { durable: true });
      }

      this.isConnectedFlag = true;
      console.log(`[${this.config.serviceName}] Connected to RabbitMQ`);

      // Handle connection errors
      conn.on('error', (err) => {
        console.error(`[${this.config.serviceName}] RabbitMQ connection error:`, err);
        this.isConnectedFlag = false;
      });

      conn.on('close', () => {
        console.warn(`[${this.config.serviceName}] RabbitMQ connection closed`);
        this.isConnectedFlag = false;
      });
    } catch (error) {
      console.error(`[${this.config.serviceName}] Failed to connect to RabbitMQ:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnectedFlag = false;
      console.log(`[${this.config.serviceName}] Disconnected from RabbitMQ`);
    } catch (error) {
      console.error(`[${this.config.serviceName}] Error disconnecting from RabbitMQ:`, error);
    }
  }

  /**
   * Publish an event to the appropriate exchange
   */
  async publish<TPayload = unknown>(
    eventName: EventName,
    payload: TPayload,
    correlationId?: string
  ): Promise<void> {
    if (!this.channel || !this.isConnectedFlag) {
      throw new Error('Not connected to RabbitMQ');
    }

    const exchange = this.getExchangeForEvent(eventName);
    const event: BaseEvent & { payload: TPayload } = {
      eventId: uuidv4(),
      eventName,
      timestamp: new Date(),
      correlationId: correlationId || uuidv4(),
      payload,
    };

    this.channel.publish(exchange, eventName, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
    });

    console.log(`[${this.config.serviceName}] Published event: ${eventName}`, { eventId: event.eventId });
  }

  /**
   * Subscribe to an event
   */
  async subscribe<TEvent extends StreamiaEvent = StreamiaEvent>(
    eventName: EventName,
    handler: EventHandler<TEvent>,
    queueName?: string
  ): Promise<void> {
    if (!this.channel || !this.isConnectedFlag) {
      throw new Error('Not connected to RabbitMQ');
    }

    const exchange = this.getExchangeForEvent(eventName);
    const queue = queueName || `${this.config.serviceName}.${eventName}`;

    // Assert the queue
    await this.channel.assertQueue(queue, { durable: true });

    // Bind the queue to the exchange with the routing key (event name)
    await this.channel.bindQueue(queue, exchange, eventName);

    // Store the handler
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler as EventHandler<unknown>);
    this.handlers.set(eventName, handlers);

    // Consume messages
    const channel = this.channel;
    await this.channel.consume(queue, async (msg: ConsumeMessage | null) => {
      if (msg) {
        try {
          const event = JSON.parse(msg.content.toString()) as TEvent;
          console.log(`[${this.config.serviceName}] Received event: ${eventName}`, {
            eventId: (event as BaseEvent).eventId,
          });

          // Execute all handlers for this event
          const eventHandlers = this.handlers.get(eventName) || [];
          for (const h of eventHandlers) {
            await (h as EventHandler<TEvent>)(event);
          }

          // Acknowledge the message
          channel.ack(msg);
        } catch (error) {
          console.error(`[${this.config.serviceName}] Error processing event ${eventName}:`, error);
          // Reject and requeue the message
          channel.nack(msg, false, true);
        }
      }
    });

    console.log(`[${this.config.serviceName}] Subscribed to event: ${eventName} on queue: ${queue}`);
  }

  /**
   * Get the exchange name for an event
   */
  private getExchangeForEvent(eventName: EventName): string {
    const prefix = eventName.split('.')[0];
    switch (prefix) {
      case 'user':
        return EXCHANGES.USER_EVENTS;
      case 'movie':
        return EXCHANGES.MOVIE_EVENTS;
      case 'favorite':
      case 'favorites':
        return EXCHANGES.FAVORITES_EVENTS;
      case 'rating':
      case 'ratings':
        return EXCHANGES.RATING_EVENTS;
      case 'comment':
      case 'comments':
        return EXCHANGES.COMMENT_EVENTS;
      case 'notification':
        return EXCHANGES.NOTIFICATION_EVENTS;
      default:
        return EXCHANGES.USER_EVENTS;
    }
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnectedFlag;
  }
}

/**
 * Create an event ID
 */
export function createEventId(): string {
  return uuidv4();
}
