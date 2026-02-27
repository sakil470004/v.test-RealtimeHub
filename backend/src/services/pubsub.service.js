/**
 * ===========================================
 * REDIS PUB/SUB SERVICE
 * ===========================================
 * 
 * CORE REDIS LEARNING MODULE
 * 
 * ===========================================
 * WHAT IS PUB/SUB?
 * ===========================================
 * 
 * Pub/Sub = Publish/Subscribe messaging pattern
 * 
 * PUBLISHER: Sends messages to a CHANNEL
 * SUBSCRIBER: Receives messages from channels they're subscribed to
 * 
 * Publishers don't know who subscribers are!
 * Subscribers don't know who publishers are!
 * They only know about CHANNELS
 * 
 * ===========================================
 * REAL-WORLD ANALOGY
 * ===========================================
 * 
 * Radio Stations:
 * - Station (Publisher) broadcasts on a frequency (Channel)
 * - Listeners (Subscribers) tune in to frequencies
 * - Station doesn't know who's listening
 * - Listeners can tune to multiple stations
 * 
 * ===========================================
 * WHY USE REDIS PUB/SUB?
 * ===========================================
 * 
 * 1. REAL-TIME UPDATES
 *    - Instant notifications
 *    - Live activity feeds
 *    - Typing indicators
 *    - Online status
 * 
 * 2. DECOUPLING
 *    - Publisher doesn't wait for subscribers
 *    - Fire and forget
 *    - Loose coupling between services
 * 
 * 3. SCALABILITY
 *    - Multiple servers can subscribe
 *    - Horizontal scaling works naturally
 *    - Each server gets all messages
 * 
 * ===========================================
 * HOW IT WORKS IN OUR APP
 * ===========================================
 * 
 * 1. User A likes User B's post
 * 2. Worker creates notification
 * 3. Worker PUBLISHES to channel "notifications:userB"
 * 4. API server is SUBSCRIBED to User B's channel
 * 5. API server receives message
 * 6. API server sends to User B via WebSocket
 * 7. User B sees notification instantly!
 * 
 * Flow:
 * Worker → Redis PUB/SUB → API Server → WebSocket → User's Browser
 * 
 * ===========================================
 * REDIS PUB/SUB COMMANDS
 * ===========================================
 * 
 * PUBLISH channel message
 * - Sends message to all subscribers of channel
 * - Returns number of subscribers that received it
 * 
 * SUBSCRIBE channel [channel ...]
 * - Subscribe to one or more channels
 * - Connection enters "subscription mode"
 * - Can only receive messages and (un)subscribe
 * 
 * PSUBSCRIBE pattern [pattern ...]
 * - Subscribe using pattern matching
 * - Example: notifications:* matches notifications:user1, notifications:user2
 * 
 * UNSUBSCRIBE [channel ...]
 * - Unsubscribe from channels
 * 
 * ===========================================
 * IMPORTANT LIMITATION!
 * ===========================================
 * 
 * A Redis connection in subscription mode CANNOT:
 * - Run normal commands (GET, SET, etc.)
 * - Only SUBSCRIBE, UNSUBSCRIBE, PSUBSCRIBE, PUNSUBSCRIBE
 * 
 * SOLUTION: Use separate Redis clients!
 * - One for regular commands (cache, etc.)
 * - One for subscribing
 * - One for publishing (can share with regular client)
 */

const { createClient } = require('redis');

// ===========================================
// CHANNEL NAMING CONVENTIONS
// ===========================================
/**
 * LEARNING: Channel Naming
 * 
 * Pattern: category:identifier
 * 
 * Examples:
 * - notifications:user:123 → Notifications for user 123
 * - chat:room:456 → Messages in chat room 456
 * - activity:global → All activity (everyone subscribes)
 * 
 * PATTERN SUBSCRIPTIONS:
 * - notifications:* → All notification channels
 * - chat:room:* → All chat rooms
 */
const CHANNELS = {
  userNotifications: (userId) => `notifications:user:${userId}`,
  globalActivity: 'activity:global',
  postActivity: (postId) => `activity:post:${postId}`,
};

// ===========================================
// PUB/SUB CLIENT MANAGEMENT
// ===========================================
/**
 * LEARNING: Separate Clients
 * 
 * We need TWO Redis connections:
 * 1. Publisher client: For publishing messages
 * 2. Subscriber client: Enters subscription mode
 * 
 * Why can't we use one?
 * - Subscriber client is in "subscription mode"
 * - Can't run normal Redis commands
 * - Dedicated to receiving messages
 */
let publisherClient = null;
let subscriberClient = null;

// Store active subscriptions
const subscriptions = new Map(); // channel → Set of callbacks

// ===========================================
// PUB/SUB SERVICE CLASS
// ===========================================
class PubSubService {
  /**
   * Initialize Pub/Sub clients
   * 
   * Called once at application startup
   */
  static async initialize() {
    const config = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      },
      password: process.env.REDIS_PASSWORD || undefined
    };
    
    // Create publisher client
    publisherClient = createClient(config);
    publisherClient.on('error', (err) => console.error('Publisher error:', err));
    await publisherClient.connect();
    console.log('✅ Pub/Sub publisher connected');
    
    // Create subscriber client (separate connection!)
    subscriberClient = createClient(config);
    subscriberClient.on('error', (err) => console.error('Subscriber error:', err));
    await subscriberClient.connect();
    console.log('✅ Pub/Sub subscriber connected');
  }
  
  /**
   * PUBLISH a message to a channel
   * 
   * LEARNING: The PUBLISH command
   * 
   * PUBLISH channel message
   * 
   * - message is always a string in Redis
   * - We JSON.stringify objects
   * - Returns number of subscribers that received it
   * - If returns 0, no one was listening!
   * 
   * FIRE AND FORGET:
   * - Message is NOT stored
   * - If no subscribers, message is lost
   * - Not suitable for critical messages that MUST be received
   * 
   * For guaranteed delivery, use:
   * - Redis Streams (more complex)
   * - Message queue (BullMQ)
   */
  static async publish(channel, message) {
    if (!publisherClient) {
      throw new Error('PubSub not initialized');
    }
    
    try {
      const payload = JSON.stringify(message);
      const receivers = await publisherClient.publish(channel, payload);
      
      console.log(`📢 PUBLISHED to ${channel}: ${receivers} receivers`);
      return receivers;
    } catch (error) {
      console.error('Publish error:', error);
      throw error;
    }
  }
  
  /**
   * SUBSCRIBE to a channel
   * 
   * LEARNING: The SUBSCRIBE command
   * 
   * SUBSCRIBE channel
   * 
   * - Connection enters subscription mode
   * - Receives all messages published to channel
   * - Message handler called for each message
   * 
   * We wrap the callback to:
   * - Parse JSON
   * - Handle errors
   * - Support multiple callbacks per channel
   */
  static async subscribe(channel, callback) {
    if (!subscriberClient) {
      throw new Error('PubSub not initialized');
    }
    
    // Track callbacks for this channel
    if (!subscriptions.has(channel)) {
      subscriptions.set(channel, new Set());
      
      // Actually subscribe to Redis (only first time)
      await subscriberClient.subscribe(channel, (message, messageChannel) => {
        try {
          const parsed = JSON.parse(message);
          
          // Call all registered callbacks
          const callbacks = subscriptions.get(messageChannel);
          if (callbacks) {
            callbacks.forEach(cb => {
              try {
                cb(parsed, messageChannel);
              } catch (err) {
                console.error('Callback error:', err);
              }
            });
          }
        } catch (error) {
          console.error('Message parse error:', error);
        }
      });
      
      console.log(`👂 SUBSCRIBED to ${channel}`);
    }
    
    // Add this callback
    subscriptions.get(channel).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = subscriptions.get(channel);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          // No more callbacks, unsubscribe from Redis
          subscriberClient.unsubscribe(channel);
          subscriptions.delete(channel);
          console.log(`🔇 UNSUBSCRIBED from ${channel}`);
        }
      }
    };
  }
  
  /**
   * PATTERN SUBSCRIBE
   * 
   * LEARNING: Pattern-based subscriptions
   * 
   * PSUBSCRIBE pattern
   * 
   * Patterns use glob-style matching:
   * - * matches any characters
   * - ? matches single character
   * - [abc] matches character class
   * 
   * Examples:
   * - notifications:* → All notification channels
   * - chat:room:* → All chat rooms
   * - h?llo → hello, hallo, hxllo
   * 
   * USE CASES:
   * - Admin dashboard: See all notifications (notifications:*)
   * - Logging service: Log all events (*:*)
   */
  static async pSubscribe(pattern, callback) {
    if (!subscriberClient) {
      throw new Error('PubSub not initialized');
    }
    
    await subscriberClient.pSubscribe(pattern, (message, channel) => {
      try {
        const parsed = JSON.parse(message);
        callback(parsed, channel);
      } catch (error) {
        console.error('Pattern message parse error:', error);
      }
    });
    
    console.log(`👂 PATTERN SUBSCRIBED to ${pattern}`);
    
    return () => {
      subscriberClient.pUnsubscribe(pattern);
      console.log(`🔇 PATTERN UNSUBSCRIBED from ${pattern}`);
    };
  }
  
  // ===========================================
  // DOMAIN-SPECIFIC METHODS
  // ===========================================
  
  /**
   * Publish notification to specific user
   * 
   * Called by worker when notification is created
   */
  static async publishNotification(userId, notification) {
    const channel = CHANNELS.userNotifications(userId);
    return await this.publish(channel, {
      type: 'notification',
      data: notification,
      timestamp: Date.now()
    });
  }
  
  /**
   * Subscribe to user's notifications
   * 
   * Called by API server when user connects via WebSocket
   */
  static async subscribeToUserNotifications(userId, callback) {
    const channel = CHANNELS.userNotifications(userId);
    return await this.subscribe(channel, callback);
  }
  
  /**
   * Publish activity to global feed
   * 
   * For features like "trending" or "recent activity"
   */
  static async publishGlobalActivity(activity) {
    return await this.publish(CHANNELS.globalActivity, {
      type: 'activity',
      data: activity,
      timestamp: Date.now()
    });
  }
  
  /**
   * Subscribe to global activity
   */
  static async subscribeToGlobalActivity(callback) {
    return await this.subscribe(CHANNELS.globalActivity, callback);
  }
  
  /**
   * Publish activity on a specific post
   * 
   * For real-time like counts, comments, etc.
   */
  static async publishPostActivity(postId, activity) {
    const channel = CHANNELS.postActivity(postId);
    return await this.publish(channel, {
      type: 'post_activity',
      postId,
      data: activity,
      timestamp: Date.now()
    });
  }
  
  /**
   * Subscribe to post activity
   * 
   * Called when user is viewing a post
   */
  static async subscribeToPost(postId, callback) {
    const channel = CHANNELS.postActivity(postId);
    return await this.subscribe(channel, callback);
  }
  
  /**
   * Cleanup on shutdown
   */
  static async disconnect() {
    if (publisherClient) await publisherClient.quit();
    if (subscriberClient) await subscriberClient.quit();
    console.log('Pub/Sub disconnected');
  }
}

// ===========================================
// USAGE EXAMPLE (For reference)
// ===========================================
/**
 * LEARNING: Complete Pub/Sub Flow
 * 
 * 1. INITIALIZATION (server startup)
 * 
 *    await PubSubService.initialize();
 * 
 * 
 * 2. SUBSCRIBING (when user connects via WebSocket)
 * 
 *    const unsubscribe = await PubSubService.subscribeToUserNotifications(
 *      userId,
 *      (notification) => {
 *        // Send to user via WebSocket
 *        socket.emit('notification', notification);
 *      }
 *    );
 *    
 *    // When user disconnects
 *    unsubscribe();
 * 
 * 
 * 3. PUBLISHING (from worker or controller)
 * 
 *    await PubSubService.publishNotification(userId, {
 *      type: 'like',
 *      message: 'John liked your post',
 *      postId: '123'
 *    });
 * 
 * 
 * 4. REAL-TIME FLOW
 * 
 *    [Worker] → publishes to Redis
 *    [Redis] → delivers to all subscribers
 *    [API Server] → receives message
 *    [WebSocket] → sends to client
 *    [Browser] → shows notification!
 */

module.exports = {
  PubSubService,
  CHANNELS
};
