/**
 * ===========================================
 * REDIS RATE LIMITING SERVICE
 * ===========================================
 * 
 * CORE REDIS LEARNING MODULE
 * 
 * ===========================================
 * WHAT IS RATE LIMITING?
 * ===========================================
 * 
 * Rate limiting = Controlling how many requests a user can make
 * 
 * WHY RATE LIMIT?
 * 
 * 1. PREVENT ABUSE
 *    - Stop spam (posting 1000 times per second)
 *    - Prevent automated attacks
 *    - Fair usage for all users
 * 
 * 2. PROTECT SERVERS
 *    - Prevent server overload
 *    - Maintain service quality
 *    - Manage resource usage
 * 
 * 3. SECURITY
 *    - Prevent brute force attacks (password guessing)
 *    - Stop credential stuffing
 *    - Mitigate DDoS attacks
 * 
 * 4. BUSINESS LOGIC
 *    - API tier limits (free vs premium)
 *    - Monetization (pay for more requests)
 * 
 * ===========================================
 * RATE LIMITING ALGORITHMS
 * ===========================================
 * 
 * 1. FIXED WINDOW COUNTER
 *    
 *    How it works:
 *    - Divide time into fixed windows (e.g., 1-minute windows)
 *    - Count requests in each window
 *    - Reset count when window changes
 *    
 *    Example: Max 10 requests per minute
 *    12:00:00 - 12:00:59 → Count requests, max 10
 *    12:01:00 - 12:01:59 → New window, count resets
 *    
 *    Pros: Simple, memory efficient
 *    Cons: Burst at window edges (20 requests in 2 seconds!)
 *          User makes 10 at 12:00:59, 10 at 12:01:00
 * 
 * 2. SLIDING WINDOW LOG
 *    
 *    How it works:
 *    - Store timestamp of each request
 *    - Count requests in past N seconds
 *    
 *    Pros: Very accurate
 *    Cons: Memory intensive (stores every timestamp)
 * 
 * 3. SLIDING WINDOW COUNTER (We use this) ✅
 *    
 *    How it works:
 *    - Hybrid of fixed and sliding window
 *    - Two fixed windows with weighted average
 *    - Previous window count × overlap% + current window count
 *    
 *    Pros: Accurate, memory efficient
 *    Cons: Slightly more complex
 * 
 * 4. TOKEN BUCKET
 *    
 *    How it works:
 *    - Bucket holds tokens (max capacity)
 *    - Tokens added at steady rate (refill rate)
 *    - Each request consumes 1 token
 *    - No tokens = rate limited
 *    
 *    Pros: Allows controlled bursts
 *    Cons: More complex, needs timer for refill
 * 
 * 5. LEAKY BUCKET
 *    
 *    How it works:
 *    - Requests enter bucket
 *    - Processed at constant rate (like water dripping)
 *    - Bucket overflow = rate limited
 *    
 *    Pros: Smooth output rate
 *    Cons: Doesn't allow any bursts
 * 
 * ===========================================
 * WHY REDIS FOR RATE LIMITING?
 * ===========================================
 * 
 * 1. ATOMIC OPERATIONS
 *    INCR and EXPIRE are atomic
 *    No race conditions between check and increment
 * 
 * 2. SPEED
 *    Rate checks must be FAST (every request!)
 *    Redis: < 1ms
 *    Database: 5-50ms (too slow!)
 * 
 * 3. DISTRIBUTED
 *    Multiple servers share same Redis
 *    Rate limit applies across all servers
 * 
 * 4. AUTO-CLEANUP
 *    Keys expire automatically (TTL)
 *    No memory leaks
 */

const { getRedisClient } = require('../config/redis');

// ===========================================
// RATE LIMIT CONFIGURATION
// ===========================================
/**
 * LEARNING: Configuration structure
 * 
 * Each limit type has:
 * - maxRequests: How many allowed
 * - windowSeconds: Time window
 * 
 * These can be adjusted based on:
 * - User type (free vs premium)
 * - Endpoint sensitivity
 * - Business requirements
 */
const RATE_LIMITS = {
  // Posts: Prevent spam
  POST_CREATE: {
    maxRequests: parseInt(process.env.RATE_LIMIT_POSTS_PER_MINUTE) || 5,
    windowSeconds: 60,
    message: 'Too many posts. Please wait before posting again.'
  },
  
  // Comments: Allow more than posts
  COMMENT_CREATE: {
    maxRequests: parseInt(process.env.RATE_LIMIT_COMMENTS_PER_MINUTE) || 10,
    windowSeconds: 60,
    message: 'Too many comments. Please slow down.'
  },
  
  // Likes: Allow many (quick interaction)
  LIKE: {
    maxRequests: parseInt(process.env.RATE_LIMIT_LIKES_PER_MINUTE) || 30,
    windowSeconds: 60,
    message: 'Too many likes. Please wait a moment.'
  },
  
  // Login: CRITICAL for security
  LOGIN: {
    maxRequests: parseInt(process.env.RATE_LIMIT_LOGIN_ATTEMPTS) || 5,
    windowSeconds: 300, // 5 minutes - longer window for security
    message: 'Too many login attempts. Please try again in 5 minutes.'
  },
  
  // Password reset: Very strict
  PASSWORD_RESET: {
    maxRequests: 3,
    windowSeconds: 3600, // 1 hour
    message: 'Too many password reset requests. Try again later.'
  },
  
  // Generic API rate limit
  API: {
    maxRequests: 100,
    windowSeconds: 60,
    message: 'Too many requests. Please slow down.'
  }
};

// ===========================================
// KEY GENERATION
// ===========================================
/**
 * LEARNING: Rate limit key design
 * 
 * Format: rate:{type}:{identifier}:{window}
 * 
 * - type: What action (post, comment, login)
 * - identifier: Who (userId or IP)
 * - window: Time window (optional, for fixed window)
 * 
 * Examples:
 * - rate:post:user123 → Posts by user123
 * - rate:login:192.168.1.1 → Logins from IP
 */
const getRateLimitKey = (type, identifier) => {
  return `rate:${type}:${identifier}`;
};

// ===========================================
// RATE LIMITER CLASS
// ===========================================
class RateLimiter {
  /**
   * FIXED WINDOW COUNTER IMPLEMENTATION
   * 
   * LEARNING: The Algorithm
   * 
   * 1. Generate key based on type + user
   * 2. INCR the key (atomic increment)
   * 3. If first increment, SET TTL (expire)
   * 4. If count > limit, REJECT
   * 
   * REDIS COMMANDS USED:
   * 
   * INCR key
   * - Increments number stored at key
   * - If key doesn't exist, sets to 0 then increments
   * - Returns new value
   * - ATOMIC - thread safe!
   * 
   * EXPIRE key seconds
   * - Sets TTL (time to live)
   * - Key auto-deletes after TTL
   * 
   * TTL key
   * - Returns remaining TTL in seconds
   * - -1 if no TTL, -2 if key doesn't exist
   */
  static async checkLimit(type, identifier) {
    const config = RATE_LIMITS[type];
    if (!config) {
      console.warn(`Unknown rate limit type: ${type}`);
      return { allowed: true };
    }
    
    const key = getRateLimitKey(type, identifier);
    
    try {
      const client = getRedisClient();
      
      /**
       * LEARNING: INCR command
       * 
       * INCR is ATOMIC - this is crucial!
       * 
       * Without atomicity (BAD):
       * 1. Read current count
       * 2. Check if under limit
       * 3. Increment and save
       * 
       * Race condition: Two requests read "4", both pass check,
       * both increment to "5" - but should be "6"!
       * 
       * With INCR (GOOD):
       * 1. INCR atomically increments
       * 2. Returns new value
       * 3. Check against limit
       * 
       * No race possible - Redis guarantees atomic operation
       */
      const currentCount = await client.incr(key);
      
      /**
       * LEARNING: Setting TTL on first request
       * 
       * Only set TTL when count is 1 (first request in window)
       * - Subsequent requests don't need TTL update
       * - Window starts from FIRST request, not first limit hit
       */
      if (currentCount === 1) {
        await client.expire(key, config.windowSeconds);
      }
      
      // Get TTL for response headers
      const ttl = await client.ttl(key);
      
      // Calculate remaining requests
      const remaining = Math.max(0, config.maxRequests - currentCount);
      
      /**
       * LEARNING: Response structure
       * 
       * We return:
       * - allowed: Can the request proceed?
       * - remaining: How many more requests allowed?
       * - resetIn: Seconds until limit resets
       * - limit: Max requests allowed
       * 
       * This info is typically sent in response headers:
       * X-RateLimit-Limit: 10
       * X-RateLimit-Remaining: 7
       * X-RateLimit-Reset: 1614556800 (Unix timestamp)
       */
      if (currentCount > config.maxRequests) {
        console.log(`🚫 RATE LIMITED: ${type} for ${identifier} (${currentCount}/${config.maxRequests})`);
        return {
          allowed: false,
          remaining: 0,
          resetIn: ttl,
          limit: config.maxRequests,
          message: config.message
        };
      }
      
      console.log(`✅ RATE CHECK OK: ${type} for ${identifier} (${currentCount}/${config.maxRequests})`);
      return {
        allowed: true,
        remaining,
        resetIn: ttl,
        limit: config.maxRequests
      };
      
    } catch (error) {
      console.error('Rate limiter error:', error);
      /**
       * LEARNING: Fail Open vs Fail Closed
       * 
       * FAIL OPEN: If rate limiter fails, allow request
       * - Better user experience
       * - Risk: Abuse during outage
       * 
       * FAIL CLOSED: If rate limiter fails, deny request
       * - More secure
       * - Risk: All users blocked during outage
       * 
       * Decision based on endpoint sensitivity:
       * - Login: Maybe fail closed (security critical)
       * - Posts: Fail open (UX priority)
       */
      return { allowed: true, error: true };
    }
  }
  
  /**
   * SLIDING WINDOW COUNTER IMPLEMENTATION
   * 
   * LEARNING: More accurate rate limiting
   * 
   * PROBLEM WITH FIXED WINDOW:
   * User can burst at window edges
   * 
   * Example (limit: 10/minute):
   * - 10 requests at 12:00:55
   * - 10 requests at 12:01:05
   * - 20 requests in 10 seconds! ❌
   * 
   * SLIDING WINDOW SOLUTION:
   * - Track current AND previous window
   * - Weight previous window by overlap
   * 
   * At 12:01:15 (45 seconds into new window):
   * - Previous window: 10 requests (15/60 = 25% overlap)
   * - Current window: 5 requests (100%)
   * - Effective: (10 × 0.25) + (5 × 1) = 7.5 → 8 requests
   */
  static async checkLimitSlidingWindow(type, identifier) {
    const config = RATE_LIMITS[type];
    if (!config) {
      return { allowed: true };
    }
    
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const currentWindow = Math.floor(now / windowMs);
    const previousWindow = currentWindow - 1;
    
    const currentKey = `${getRateLimitKey(type, identifier)}:${currentWindow}`;
    const previousKey = `${getRateLimitKey(type, identifier)}:${previousWindow}`;
    
    try {
      const client = getRedisClient();
      
      // Use MULTI for atomic operations
      /**
       * LEARNING: Redis Transactions (MULTI/EXEC)
       * 
       * MULTI: Start a transaction
       * ...commands...
       * EXEC: Execute all commands atomically
       * 
       * All commands execute without interruption
       * Other clients can't interleave
       */
      const [currentCount, previousCount] = await Promise.all([
        client.get(currentKey),
        client.get(previousKey)
      ]);
      
      // Calculate weighted count
      const positionInWindow = (now % windowMs) / windowMs;
      const previousWeight = 1 - positionInWindow;
      
      const weightedCount = 
        (parseInt(previousCount) || 0) * previousWeight +
        (parseInt(currentCount) || 0);
      
      if (weightedCount >= config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetIn: Math.ceil((1 - positionInWindow) * config.windowSeconds),
          limit: config.maxRequests,
          message: config.message
        };
      }
      
      // Increment current window counter
      await client.multi()
        .incr(currentKey)
        .expire(currentKey, config.windowSeconds * 2) // Keep for 2 windows
        .exec();
      
      return {
        allowed: true,
        remaining: Math.floor(config.maxRequests - weightedCount - 1),
        resetIn: Math.ceil((1 - positionInWindow) * config.windowSeconds),
        limit: config.maxRequests
      };
      
    } catch (error) {
      console.error('Sliding window rate limiter error:', error);
      return { allowed: true, error: true };
    }
  }
  
  /**
   * Reset rate limit for a user/identifier
   * 
   * USE CASES:
   * - Admin manually resets user's limit
   * - After successful password reset, clear login attempts
   * - Testing purposes
   */
  static async resetLimit(type, identifier) {
    try {
      const client = getRedisClient();
      const key = getRateLimitKey(type, identifier);
      await client.del(key);
      console.log(`🔄 RATE LIMIT RESET: ${type} for ${identifier}`);
      return true;
    } catch (error) {
      console.error('Rate limit reset error:', error);
      return false;
    }
  }
  
  /**
   * Get current usage without incrementing
   * 
   * LEARNING: Read-only check
   * 
   * Sometimes you want to show users their current usage
   * without counting this as a request
   */
  static async getCurrentUsage(type, identifier) {
    const config = RATE_LIMITS[type];
    if (!config) {
      return null;
    }
    
    try {
      const client = getRedisClient();
      const key = getRateLimitKey(type, identifier);
      
      const [count, ttl] = await Promise.all([
        client.get(key),
        client.ttl(key)
      ]);
      
      return {
        current: parseInt(count) || 0,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - (parseInt(count) || 0)),
        resetIn: ttl > 0 ? ttl : config.windowSeconds
      };
    } catch (error) {
      console.error('Get usage error:', error);
      return null;
    }
  }
}

// ===========================================
// EXPRESS MIDDLEWARE
// ===========================================
/**
 * LEARNING: Rate Limiting as Middleware
 * 
 * Middleware runs BEFORE route handlers
 * If rate limited, request never reaches your logic
 * 
 * USAGE:
 * router.post('/posts',
 *   rateLimitMiddleware('POST_CREATE'),
 *   createPost
 * );
 */
const rateLimitMiddleware = (type, identifierFn = null) => {
  return async (req, res, next) => {
    /**
     * LEARNING: Identifier selection
     * 
     * What identifies a user?
     * 
     * LOGGED IN: User ID (req.user.id)
     * - Accurate per-user limiting
     * 
     * NOT LOGGED IN: IP Address
     * - Beware: Multiple users behind NAT share IP
     * - Consider X-Forwarded-For header behind proxies
     * 
     * BEST PRACTICE: Use user ID when available, fall back to IP
     */
    const identifier = identifierFn 
      ? identifierFn(req)
      : (req.user?.id || req.ip || req.headers['x-forwarded-for'] || 'unknown');
    
    const result = await RateLimiter.checkLimit(type, identifier);
    
    /**
     * LEARNING: Rate Limit Headers
     * 
     * Standard headers to inform clients:
     * - X-RateLimit-Limit: Max requests allowed
     * - X-RateLimit-Remaining: Requests left in window
     * - X-RateLimit-Reset: Unix timestamp when limit resets
     * - Retry-After: Seconds until can retry (when limited)
     */
    res.setHeader('X-RateLimit-Limit', result.limit || 0);
    res.setHeader('X-RateLimit-Remaining', result.remaining || 0);
    res.setHeader('X-RateLimit-Reset', Date.now() + (result.resetIn || 0) * 1000);
    
    if (!result.allowed) {
      res.setHeader('Retry-After', result.resetIn);
      return res.status(429).json({
        success: false,
        message: result.message || 'Too many requests',
        retryAfter: result.resetIn
      });
    }
    
    next();
  };
};

/**
 * IP-based rate limiter for unauthenticated routes
 */
const ipRateLimitMiddleware = (type) => {
  return rateLimitMiddleware(type, (req) => {
    // Get real IP behind proxy
    return req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
  });
};

/**
 * User-based rate limiter for authenticated routes
 */
const userRateLimitMiddleware = (type) => {
  return rateLimitMiddleware(type, (req) => {
    return req.user?.id || 'anonymous';
  });
};

module.exports = {
  RateLimiter,
  RATE_LIMITS,
  rateLimitMiddleware,
  ipRateLimitMiddleware,
  userRateLimitMiddleware
};
