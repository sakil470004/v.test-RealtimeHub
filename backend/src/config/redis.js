/**
 * ===========================================
 * REDIS CONNECTION & CONFIGURATION
 * ===========================================
 * 
 * WHAT IS REDIS?
 * - Remote Dictionary Server
 * - In-memory data structure store
 * - Can be used as: Database, Cache, Message Broker, Queue
 * - Supports various data structures
 * 
 * ===========================================
 * REDIS DATA STRUCTURES (LEARN THESE!)
 * ===========================================
 * 
 * 1. STRINGS
 *    - Simplest type, can store text, numbers, or binary
 *    - Commands: SET, GET, INCR, DECR, EXPIRE
 *    - Use case: Caching, counters, rate limiting
 *    Example:
 *    SET user:1:name "John"
 *    GET user:1:name → "John"
 *    INCR page:views → 1, 2, 3...
 * 
 * 2. HASHES
 *    - Like a mini key-value store within a key
 *    - Commands: HSET, HGET, HGETALL, HDEL
 *    - Use case: Store objects/records
 *    Example:
 *    HSET user:1 name "John" age 25 email "john@mail.com"
 *    HGET user:1 name → "John"
 *    HGETALL user:1 → {name: "John", age: "25", email: "john@mail.com"}
 * 
 * 3. LISTS
 *    - Ordered collection of strings (linked list)
 *    - Commands: LPUSH, RPUSH, LPOP, RPOP, LRANGE
 *    - Use case: Queues, recent activity, timelines
 *    Example:
 *    LPUSH queue:emails "email1" "email2"
 *    RPOP queue:emails → "email1" (FIFO queue)
 *    LRANGE recent:posts 0 9 → Last 10 posts
 * 
 * 4. SETS
 *    - Unordered collection of unique strings
 *    - Commands: SADD, SREM, SMEMBERS, SISMEMBER
 *    - Use case: Tags, unique items, followers
 *    Example:
 *    SADD user:1:followers "user:2" "user:3"
 *    SISMEMBER user:1:followers "user:2" → 1 (true)
 * 
 * 5. SORTED SETS
 *    - Set with a score for each member (sorted by score)
 *    - Commands: ZADD, ZRANGE, ZRANK, ZSCORE
 *    - Use case: Leaderboards, priority queues
 *    Example:
 *    ZADD leaderboard 100 "player1" 200 "player2"
 *    ZRANGE leaderboard 0 -1 WITHSCORES → ranked list
 * 
 * ===========================================
 * WHY REDIS IS FAST
 * ===========================================
 * 
 * 1. IN-MEMORY STORAGE
 *    - Data stored in RAM, not disk
 *    - RAM access: ~100 nanoseconds
 *    - Disk access: ~10 milliseconds
 *    - Redis is 100,000x faster than disk!
 * 
 * 2. SINGLE-THREADED
 *    - No context switching overhead
 *    - No locking needed (atomic operations)
 *    - Uses I/O multiplexing for concurrency
 * 
 * 3. EFFICIENT DATA STRUCTURES
 *    - Purpose-built for performance
 *    - Memory-optimized encodings
 * 
 * ===========================================
 * PERSISTENCE OPTIONS
 * ===========================================
 * 
 * 1. RDB (Redis Database Backup)
 *    - Point-in-time snapshots
 *    - Good for backups
 *    - Faster restarts
 *    - Possible data loss between snapshots
 * 
 * 2. AOF (Append Only File)
 *    - Logs every write operation
 *    - More durable (less data loss)
 *    - Larger files, slower restarts
 * 
 * 3. HYBRID (RDB + AOF)
 *    - Best of both worlds
 *    - Recommended for production
 */

const { createClient } = require('redis');

// Store the Redis client instance
let redisClient = null;

/**
 * LEARNING: Redis Connection
 * 
 * Connection options we can configure:
 * - socket: Host and port configuration
 * - password: Authentication
 * - database: Select database (0-15 by default)
 * - name: Client name for debugging
 * - legacyMode: Compatibility with older redis npm versions
 */
const connectRedis = async () => {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        /**
         * LEARNING: Reconnection Strategy
         * 
         * What happens when Redis connection is lost?
         * - Network issues
         * - Redis server restart
         * - Memory limits reached
         * 
         * We implement exponential backoff:
         * - First retry: 50ms
         * - Second retry: 100ms
         * - Third retry: 200ms
         * - Maximum: 3000ms
         * 
         * WHY EXPONENTIAL BACKOFF?
         * - Prevents overwhelming the server during issues
         * - Gives server time to recover
         * - Standard practice for resilient systems
         */
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Too many retries. Giving up.');
            return new Error('Redis connection failed after 10 retries');
          }
          // Exponential backoff with max 3 seconds
          return Math.min(retries * 50, 3000);
        }
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    /**
     * LEARNING: Redis Events
     * 
     * Redis client emits events we should handle:
     * - error: Connection or command errors
     * - connect: TCP connection established
     * - ready: Redis is ready for commands
     * - reconnecting: Attempting to reconnect
     * - end: Connection closed
     */
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      console.log('Redis: Ready to accept commands');
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis: Reconnecting...');
    });

    // Connect to Redis
    await redisClient.connect();

    return redisClient;
  } catch (error) {
    console.error('Redis connection failed:', error);
    throw error;
  }
};

/**
 * Get the Redis client instance
 * 
 * LEARNING: Singleton Pattern
 * - Only one Redis connection is needed
 * - Multiple connections waste resources
 * - Redis handles many commands on one connection
 */
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

module.exports = {
  connectRedis,
  getRedisClient
};
