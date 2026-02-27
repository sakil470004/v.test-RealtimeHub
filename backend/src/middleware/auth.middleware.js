/**
 * ===========================================
 * JWT AUTHENTICATION MIDDLEWARE
 * ===========================================
 * 
 * LEARNING: Authentication vs Authorization
 * 
 * AUTHENTICATION: "Who are you?"
 * - Verify user identity
 * - Login process
 * - JWT validation
 * 
 * AUTHORIZATION: "What can you do?"
 * - Check permissions
 * - Role-based access
 * - Resource ownership
 * 
 * ===========================================
 * HOW JWT AUTHENTICATION WORKS
 * ===========================================
 * 
 * 1. USER LOGS IN
 *    - Sends credentials (email/password)
 *    - Server validates credentials
 *    - Server creates JWT with user info
 *    - Server sends JWT to client
 * 
 * 2. CLIENT STORES JWT
 *    - LocalStorage (common but XSS vulnerable)
 *    - HttpOnly Cookie (more secure)
 *    - Memory (most secure, lost on refresh)
 * 
 * 3. CLIENT SENDS JWT WITH REQUESTS
 *    - Authorization header: "Bearer <token>"
 *    - Server validates token on each request
 * 
 * 4. SERVER VALIDATES TOKEN
 *    - Check signature (not tampered)
 *    - Check expiration (not expired)
 *    - Extract user info from payload
 * 
 * ===========================================
 * JWT STRUCTURE (3 Parts)
 * ===========================================
 * 
 * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
 * eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.
 * SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 * 
 * HEADER.PAYLOAD.SIGNATURE
 * 
 * 1. HEADER (Algorithm & Type)
 *    {
 *      "alg": "HS256",
 *      "typ": "JWT"
 *    }
 * 
 * 2. PAYLOAD (Claims/Data)
 *    {
 *      "sub": "userId123",      // Subject (user ID)
 *      "name": "John Doe",      // Custom claim
 *      "iat": 1516239022,       // Issued at
 *      "exp": 1516325422        // Expiration
 *    }
 *    
 *    COMMON CLAIMS:
 *    - iss: Issuer
 *    - sub: Subject (usually user ID)
 *    - aud: Audience
 *    - exp: Expiration time
 *    - iat: Issued at
 *    - jti: JWT ID (unique identifier)
 * 
 * 3. SIGNATURE
 *    HMACSHA256(
 *      base64UrlEncode(header) + "." + base64UrlEncode(payload),
 *      secret
 *    )
 *    
 *    - Signature proves token wasn't tampered
 *    - Changing any part invalidates signature
 *    - Only server knows the secret
 * 
 * ⚠️ IMPORTANT: Payload is NOT encrypted!
 * - Anyone can decode and read it
 * - Never put sensitive data (passwords, etc.)
 * - Signature only prevents tampering, not reading
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

/**
 * Generate JWT Token
 * 
 * LEARNING: Token Creation
 * 
 * jwt.sign(payload, secret, options)
 * 
 * payload: Data to include in token
 * secret: Secret key for signing (KEEP SECRET!)
 * options: 
 *   - expiresIn: When token expires
 *   - algorithm: Signing algorithm
 *   - issuer: Who issued the token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { 
      id: userId,
      iat: Math.floor(Date.now() / 1000) // Issued at
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '7d',
      // algorithm: 'HS256' // Default, can use RS256 for asymmetric
    }
  );
};

/**
 * Verify JWT Token
 * 
 * LEARNING: Token Verification
 * 
 * jwt.verify(token, secret)
 * 
 * Does:
 * 1. Decodes the token
 * 2. Verifies signature matches
 * 3. Checks expiration
 * 4. Returns payload if valid
 * 
 * Throws if:
 * - Token is malformed
 * - Signature is invalid
 * - Token is expired
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Protect Routes Middleware
 * 
 * LEARNING: Auth Middleware Pattern
 * 
 * This middleware:
 * 1. Extracts token from Authorization header
 * 2. Verifies the token
 * 3. Loads the user from database
 * 4. Attaches user to request object
 * 5. Calls next() if authenticated
 * 6. Returns 401 if not authenticated
 * 
 * USAGE:
 * router.get('/profile', protect, getProfile);
 */
const protect = async (req, res, next) => {
  try {
    let token;
    
    /**
     * LEARNING: Token Extraction
     * 
     * Standard format: "Bearer <token>"
     * 
     * Why "Bearer"?
     * - HTTP authentication scheme
     * - "Bearer" means "whoever bears this token has access"
     * - Other schemes: Basic, Digest, etc.
     */
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // No token provided
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      /**
       * LEARNING: JWT Errors
       * 
       * TokenExpiredError: Token has expired
       * JsonWebTokenError: Token is invalid/malformed
       * NotBeforeError: Token not active yet (nbf claim)
       */
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired - Please login again'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    /**
     * LEARNING: Why fetch user from database?
     * 
     * Token payload has user ID, why query again?
     * 
     * 1. User might be deleted/disabled after token issued
     * 2. User data might have changed
     * 3. Can check if user is still active
     * 4. Get fresh user data for request
     * 
     * OPTIMIZATION: Cache user data in Redis
     * - Reduces database queries
     * - Still allows checking user status
     */
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account has been deactivated'
      });
    }
    
    // Attach user to request for use in route handlers
    req.user = user;
    req.userId = user._id;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Optional Auth Middleware
 * 
 * LEARNING: Public Routes with Optional Auth
 * 
 * Some routes work for both:
 * - Anonymous users (show public content)
 * - Logged in users (show personalized content)
 * 
 * Example: Feed
 * - Anonymous: Show public posts
 * - Logged in: Show posts + "liked" status
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (token) {
      try {
        const decoded = verifyToken(token);
        const user = await User.findById(decoded.id).select('-password');
        if (user && user.isActive) {
          req.user = user;
          req.userId = user._id;
        }
      } catch (error) {
        // Token invalid, but that's OK for optional auth
        // Continue without user
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh Token (Optional - For more secure implementation)
 * 
 * LEARNING: Access vs Refresh Tokens
 * 
 * ACCESS TOKEN:
 * - Short-lived (15 min - 1 hour)
 * - Used for API requests
 * - Sent with every request
 * 
 * REFRESH TOKEN:
 * - Long-lived (days - weeks)
 * - Used only to get new access token
 * - Stored securely (HttpOnly cookie)
 * 
 * WHY TWO TOKENS?
 * - If access token leaked, attacker has limited time
 * - Refresh token stored more securely
 * - Can revoke refresh tokens server-side
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

module.exports = {
  generateToken,
  verifyToken,
  protect,
  optionalAuth,
  generateRefreshToken
};
