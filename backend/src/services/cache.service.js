/**
 * ===========================================
 * REDIS CACHING SERVICE
 * ===========================================
 * 
 * CORE REDIS LEARNING MODULE
 * 
 * ===========================================
 * WHAT IS CACHING?
 * ===========================================
 * 
 * Caching = Storing frequently accessed data in fast storage
 * 
 * WITHOUT CACHE:
 * Request → Server → Database → Server → Response
 * Time: ~100ms (database query)
 * 
 * WITH CACHE:
 * Request → Server → Cache → Server → Response
 * Time: ~1ms (Redis lookup)
 * 
 * ===========================================
 * WHY USE REDIS FOR CACHING?
 * ===========================================
 * 
 * 1. SPEED
 *    - In-memory storage = nanosecond access
 *    - Database on disk = millisecond access
 *    - 100-1000x faster!
 * 
 * 2. REDUCES DATABASE LOAD
 *    - Same data requested 1000 times?
 *    - 1 database query + 999 cache hits
 *    - Your database thanks you
 * 
 * 3. TTL (Time To Live)
 *    - Data expires automatically
 *    - No manual cleanup needed
 *    - Fresh data guaranteed
 * 
 * 4. ATOMIC OPERATIONS
 *    - No race conditions
 *    - Multiple servers can share cache
 * 
 * ===========================================
 * CACHING STRATEGIES
 * ===========================================
 * 
 * 1. CACHE-ASIDE (Lazy Loading) ✅ We use this
 *    
 *    READ:
 *    - Check cache first
 *    - If HIT → return cached data
 *    - If MISS → query database, store in cache, return
 *    
 *    WRITE:
 *    - Write to database
 *    - Invalidate (delete) cache
 *    - Next read will refresh cache
 *    
 *    Pros: Only cache what's actually used
 *    Cons: First request is slow (cache miss)
 * 
 * 2. WRITE-THROUGH
 *    
 *    WRITE:
 *    - Write to cache AND database together
 *    
 *    Pros: Cache always up-to-date
 *    Cons: Slower writes, caches unused data
 * 
 * 3. WRITE-BEHIND (Write-Back)
 *    
 *    WRITE:
 *    - Write to cache immediately
 *    - Asynchronously write to database later
 *    
 *    Pros: Very fast writes
 *    Cons: Data loss risk if cache fails
 * 
 * ===========================================
 * CACHE KEY DESIGN
 * ===========================================
 * 
 * Good key naming is CRITICAL!
 * 
 * PATTERN: entity:identifier:field
 * 
 * Examples:
 * - user:123:profile → User 123's profile data
 * - post:456 → Post 456's full data
 * - feed:user:123 → User 123's feed
 * - feed:global:page:1 → Global feed page 1
 * 
 * WHY THIS PATTERN?
 * - Easy to understand
 * - Easy to search/delete (pattern matching)
 * - Prevents key collisions
 * - Self-documenting
 */

const { getRedisClient } = require('../config/redis');

// ===========================================
// TTL CONSTANTS
// ===========================================
/**
 * LEARNING: TTL (Time To Live)
 * 
 * How long should cached data live?
 * 
 * FACTORS TO CONSIDER:
 * - How often does data change?
 * - How important is freshness?
 * - How expensive is the database query?
 * 
 * EXAMPLES:
 * - User profile: Changes rarely → 5-15 minutes
 * - Post data: Changes sometimes → 1-5 minutes
 * - Feed: Changes frequently → 30-60 seconds
 * - Trending topics: Changes very often → 15-30 seconds
 * 
 * TOO SHORT TTL:
 * - More cache misses
 * - More database queries
 * - Less benefit from caching
 * 
 * TOO LONG TTL:
 * - Stale data shown to users
 * - Inconsistencies
 * - User confusion
 */
const TTL = {
  USER_PROFILE: 5 * 60,    // 5 minutes - profiles don't change often
  POST: 3 * 60,            // 3 minutes - posts update with likes/comments
  FEED: 60,                // 60 seconds - feed changes frequently
  COMMENTS: 2 * 60,        // 2 minutes
  LIKES_LIST: 2 * 60,      // 2 minutes
  NOTIFICATION_COUNT: 30,  // 30 seconds - want near real-time
};

// ===========================================
// CACHE KEY GENERATORS
// ===========================================
/**
 * LEARNING: Key generation functions
 * 
 * WHY USE FUNCTIONS?
 * - Consistent key format
 * - Avoid typos
 * - Easy to change pattern later
 * - Type safety with parameters
 */
const CACHE_KEYS = {
  userProfile: (userId) => `profile:user:${userId}`,
  post: (postId) => `post:${postId}`,
  userFeed: (userId, cursor) => `feed:user:${userId}:cursor:${cursor || 'initial'}`,
  globalFeed: (cursor) => `feed:global:cursor:${cursor || 'initial'}`,
  postComments: (postId, cursor) => `comments:post:${postId}:cursor:${cursor || 'initial'}`,
  userNotificationCount: (userId) => `notifications:count:user:${userId}`,
  postLikedBy: (userId, postId) => `liked:user:${userId}:post:${postId}`,
  postLikeStatus: (userId, postIds) => `likestatus:user:${userId}:posts:${postIds.join(',')}`,
};

// ===========================================
// CACHE SERVICE CLASS
// ===========================================
/**
 * LEARNING: Class-based service
 * 
 * Encapsulates all caching logic in one place
 * Easy to test, maintain, and extend
 */
class CacheService {
  /**
   * GET from cache
   * 
   * LEARNING: Cache Hit vs Miss
   * 
   * HIT: Data found in cache → Return immediately
   * MISS: Data not in cache → Return null
   * 
   * The caller decides what to do on miss:
   * - Query database
   * - Save to cache
   * - Return to user
   */
  static async get(key) {
    try {
      const client = getRedisClient();
      const data = await client.get(key);
      
      /**
       * LEARNING: JSON Serialization
       * 
       * Redis stores strings only
       * Objects must be JSON.stringify() before storing
       * JSON.parse() to convert back
       * 
       * ALTERNATIVES:
       * - Redis Hashes: For flat objects, more memory efficient
       * - MessagePack: More compact binary format
       * - Protobuf: Schema-based, very compact
       */
      if (data) {
        console.log(`🟢 CACHE HIT: ${key}`);
        return JSON.parse(data);
      }
      
      console.log(`🔴 CACHE MISS: ${key}`);
      return null;
    } catch (error) {
      console.error('Cache GET error:', error);
      // Don't throw - cache failure shouldn't break the app
      // Fall back to database
      return null;
    }
  }
  
  /**
   * SET cache with TTL
   * 
   * LEARNING: The SET command
   * 
   * Basic: SET key value
   * With TTL: SET key value EX seconds
   * 
   * EX = seconds
   * PX = milliseconds
   * NX = Only set if NOT exists
   * XX = Only set if exists
   */
  static async set(key, value, ttlSeconds = 60) {
    try {
      const client = getRedisClient();
      const serialized = JSON.stringify(value);
      
      /**
       * LEARNING: SET with options
       * 
       * { EX: ttlSeconds } sets expiration
       * After TTL, key is automatically deleted
       * No need for manual cleanup!
       */
      await client.set(key, serialized, { EX: ttlSeconds });
      console.log(`📝 CACHE SET: ${key} (TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      console.error('Cache SET error:', error);
      return false;
    }
  }
  
  /**
   * DELETE cache (Invalidation)
   * 
   * LEARNING: Cache Invalidation
   * 
   * "There are only two hard things in Computer Science:
   *  cache invalidation and naming things."
   *  — Phil Karlton
   * 
   * WHEN TO INVALIDATE:
   * - Data is updated in database
   * - Data is deleted from database
   * - Related data changes (e.g., new comment → invalidate post cache)
   * 
   * INVALIDATION STRATEGIES:
   * 
   * 1. Delete specific key
   *    del('post:123');
   *    
   * 2. Delete multiple related keys
   *    del(['post:123', 'feed:user:456']);
   *    
   * 3. Delete by pattern (use carefully!)
   *    Pattern: 'feed:*'
   *    Deletes: feed:user:1, feed:user:2, feed:global
   *    ⚠️ KEYS command is slow on large datasets!
   */
  static async del(keyOrKeys) {
    try {
      const client = getRedisClient();
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      
      if (keys.length === 0) return 0;
      
      const deleted = await client.del(keys);
      console.log(`🗑️ CACHE INVALIDATE: ${keys.join(', ')} (${deleted} deleted)`);
      return deleted;
    } catch (error) {
      console.error('Cache DEL error:', error);
      return 0;
    }
  }
  
  /**
   * DELETE by pattern
   * 
   * LEARNING: Pattern-based deletion
   * 
   * ⚠️ WARNING: KEYS command scans ALL keys
   * - O(N) complexity
   * - Blocks Redis during scan
   * - Avoid in production with large datasets
   * 
   * BETTER ALTERNATIVE: SCAN command
   * - Cursor-based iteration
   * - Non-blocking
   * - Slightly more complex
   * 
   * We use SCAN here for safety:
   */
  static async delByPattern(pattern) {
    try {
      const client = getRedisClient();
      let cursor = 0;
      let deletedCount = 0;
      
      /**
       * LEARNING: SCAN command
       * 
       * SCAN cursor MATCH pattern COUNT hint
       * 
       * Returns: [newCursor, [keys]]
       * - cursor 0 → start
       * - cursor 0 in response → done
       * 
       * COUNT is a hint, not a guarantee
       */
      do {
        const reply = await client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });
        
        cursor = reply.cursor;
        const keys = reply.keys;
        
        if (keys.length > 0) {
          await client.del(keys);
          deletedCount += keys.length;
        }
      } while (cursor !== 0);
      
      console.log(`🗑️ CACHE PATTERN DELETE: ${pattern} (${deletedCount} deleted)`);
      return deletedCount;
    } catch (error) {
      console.error('Cache pattern DEL error:', error);
      return 0;
    }
  }
  
  /**
   * Check if key exists
   * 
   * LEARNING: EXISTS command
   * 
   * Returns: Number of keys that exist
   * EXISTS key1 key2 → 2 (if both exist)
   * 
   * Useful for conditional caching:
   * "Only update cache if data is already cached"
   */
  static async exists(key) {
    try {
      const client = getRedisClient();
      return await client.exists(key);
    } catch (error) {
      console.error('Cache EXISTS error:', error);
      return false;
    }
  }
  
  /**
   * Get TTL remaining
   * 
   * LEARNING: TTL command
   * 
   * Returns:
   * - Positive number: Seconds remaining
   * - -1: Key exists but no TTL (permanent)
   * - -2: Key doesn't exist
   * 
   * Useful for debugging and monitoring
   */
  static async ttl(key) {
    try {
      const client = getRedisClient();
      return await client.ttl(key);
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -2;
    }
  }
  
  // ===========================================
  // DOMAIN-SPECIFIC CACHE METHODS
  // ===========================================
  /**
   * LEARNING: Domain-specific caching
   * 
   * Instead of generic get/set everywhere:
   * await cache.set(`post:${id}`, data, 180);
   * 
   * Use domain methods:
   * await CacheService.cachePost(id, data);
   * 
   * Benefits:
   * - Consistent TTL for same data types
   * - Centralized key generation
   * - Easier to maintain
   */
  
  // --- USER PROFILE ---
  static async getUserProfile(userId) {
    const key = CACHE_KEYS.userProfile(userId);
    return await this.get(key);
  }
  
  static async setUserProfile(userId, userData) {
    const key = CACHE_KEYS.userProfile(userId);
    return await this.set(key, userData, TTL.USER_PROFILE);
  }
  
  static async invalidateUserProfile(userId) {
    const key = CACHE_KEYS.userProfile(userId);
    return await this.del(key);
  }
  
  // --- POST ---
  static async getPost(postId) {
    const key = CACHE_KEYS.post(postId);
    return await this.get(key);
  }
  
  static async setPost(postId, postData) {
    const key = CACHE_KEYS.post(postId);
    return await this.set(key, postData, TTL.POST);
  }
  
  static async invalidatePost(postId) {
    const key = CACHE_KEYS.post(postId);
    return await this.del(key);
  }
  
  // --- FEED ---
  /**
   * LEARNING: Feed Caching Strategy
   * 
   * Feeds are tricky to cache because:
   * - They change frequently (new posts)
   * - They're personalized (different for each user)
   * - They're paginated (multiple pages)
   * 
   * OUR APPROACH:
   * - Short TTL (60 seconds)
   * - Cache by cursor position
   * - Invalidate on new post
   * 
   * ALTERNATIVE: No feed caching
   * - Database with good indexes handles it well
   * - Especially with cursor pagination
   * - Consider based on your scale
   */
  static async getFeed(userId, cursor = null) {
    const key = userId 
      ? CACHE_KEYS.userFeed(userId, cursor)
      : CACHE_KEYS.globalFeed(cursor);
    return await this.get(key);
  }
  
  static async setFeed(userId, cursor, feedData) {
    const key = userId 
      ? CACHE_KEYS.userFeed(userId, cursor)
      : CACHE_KEYS.globalFeed(cursor);
    return await this.set(key, feedData, TTL.FEED);
  }
  
  static async invalidateUserFeed(userId) {
    // Invalidate all cached feed pages for this user
    const pattern = `feed:user:${userId}:*`;
    return await this.delByPattern(pattern);
  }
  
  static async invalidateGlobalFeed() {
    const pattern = 'feed:global:*';
    return await this.delByPattern(pattern);
  }
  
  // --- COMMENTS ---
  static async getPostComments(postId, cursor = null) {
    const key = CACHE_KEYS.postComments(postId, cursor);
    return await this.get(key);
  }
  
  static async setPostComments(postId, cursor, commentsData) {
    const key = CACHE_KEYS.postComments(postId, cursor);
    return await this.set(key, commentsData, TTL.COMMENTS);
  }
  
  static async invalidatePostComments(postId) {
    const pattern = `comments:post:${postId}:*`;
    return await this.delByPattern(pattern);
  }
  
  // --- NOTIFICATION COUNT ---
  /**
   * LEARNING: Counter Caching
   * 
   * Notification count is shown on every page
   * Querying DB every time is wasteful
   * 
   * Cache the count, invalidate when:
   * - New notification received
   * - Notifications marked as read
   */
  static async getNotificationCount(userId) {
    const key = CACHE_KEYS.userNotificationCount(userId);
    return await this.get(key);
  }
  
  static async setNotificationCount(userId, count) {
    const key = CACHE_KEYS.userNotificationCount(userId);
    return await this.set(key, count, TTL.NOTIFICATION_COUNT);
  }
  
  static async invalidateNotificationCount(userId) {
    const key = CACHE_KEYS.userNotificationCount(userId);
    return await this.del(key);
  }
}

// Export for use in other modules
module.exports = {
  CacheService,
  CACHE_KEYS,
  TTL
};
