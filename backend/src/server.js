/**
 * ===========================================
 * MAIN SERVER FILE - Entry Point
 * ===========================================
 * 
 * This file bootstraps our entire application.
 * It's responsible for:
 * 1. Loading environment variables
 * 2. Connecting to databases (MongoDB, Redis)
 * 3. Setting up middleware
 * 4. Configuring routes
 * 5. Starting the HTTP server with Socket.IO
 * 
 * LEARNING: Express.js Application Flow
 * Request → Middleware → Route Handler → Response
 */

// ===========================================
// IMPORTS & CONFIGURATION
// ===========================================

/**
 * dotenv - Loads environment variables from .env file
 * 
 * WHY WE USE IT:
 * - Keeps sensitive data (passwords, API keys) out of code
 * - Different configurations for dev/staging/production
 * - Never commit .env to version control!
 */
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');

// Database connections
const connectMongoDB = require('./config/mongodb');
const { connectRedis, getRedisClient } = require('./config/redis');

// Services
const { PubSubService } = require('./services/pubsub.service');

// Route imports
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const commentRoutes = require('./routes/comment.routes');
const likeRoutes = require('./routes/like.routes');
const notificationRoutes = require('./routes/notification.routes');
const userRoutes = require('./routes/user.routes');

// Initialize Express app
const app = express();

/**
 * LEARNING: HTTP Server with Socket.IO
 * 
 * Socket.IO needs access to the raw HTTP server
 * instead of just the Express app.
 * 
 * WHY?
 * - WebSocket upgrades need HTTP server access
 * - Express is a request handler, not a server
 * - This allows both HTTP and WebSocket on same port
 */
const server = http.createServer(app);

// ===========================================
// MIDDLEWARE CONFIGURATION
// ===========================================
/**
 * WHAT IS MIDDLEWARE?
 * - Functions that execute BEFORE your route handlers
 * - Can modify request/response objects
 * - Can end the request-response cycle
 * - Can call the next middleware in the stack
 * 
 * MIDDLEWARE FLOW:
 * Request → Middleware1 → Middleware2 → ... → Route Handler → Response
 */

/**
 * helmet() - Security middleware
 * 
 * WHAT IT DOES:
 * - Sets various HTTP headers to protect against common attacks
 * - X-XSS-Protection: Prevents cross-site scripting attacks
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - Content-Security-Policy: Controls which resources can be loaded
 * 
 * WHY WE USE IT:
 * - Easy to implement security best practices
 * - Protection against header-based attacks
 * - Industry standard for Express apps
 */
app.use(helmet());

/**
 * cors() - Cross-Origin Resource Sharing
 * 
 * WHAT IS CORS?
 * - A security feature implemented by browsers
 * - By default, browsers block requests to different domains
 * - CORS headers tell browser which origins are allowed
 * 
 * WHY WE NEED IT:
 * - Frontend (localhost:3000) calls Backend (localhost:5000)
 * - Different ports = different origins
 * - Without CORS, browser blocks the request
 * 
 * LEARNING: Same-Origin Policy
 * - Protocol + Host + Port must match
 * - http://localhost:3000 ≠ http://localhost:5000 (different ports)
 */
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * morgan() - HTTP request logger
 * 
 * WHAT IT DOES:
 * - Logs every incoming HTTP request
 * - Shows method, URL, status code, response time
 * 
 * WHY WE USE IT:
 * - Debugging: See what requests are being made
 * - Monitoring: Track API usage patterns
 * - Development: Quick feedback on API calls
 * 
 * LOG FORMATS:
 * - 'dev': Colored output for development
 * - 'combined': Apache combined log format
 * - 'tiny': Minimal output
 */
app.use(morgan('dev'));

/**
 * express.json() - JSON body parser
 * 
 * WHAT IT DOES:
 * - Parses incoming JSON request bodies
 * - Makes data available in req.body
 * 
 * IMPORTANT:
 * - Without this, req.body would be undefined
 * - limit: '10kb' prevents large payload attacks (DoS)
 * 
 * LEARNING: Request Body
 * - POST/PUT requests often include data in body
 * - Body is raw text by default
 * - This middleware parses JSON to JavaScript object
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ===========================================
// ROUTE CONFIGURATION
// ===========================================
/**
 * WHAT ARE ROUTES?
 * - Define how the app responds to client requests
 * - Combination of URL path + HTTP method
 * 
 * LEARNING: RESTful API Design
 * - REST = Representational State Transfer
 * - Resources are accessed via URLs
 * - HTTP methods define the action:
 *   GET    = Read (Get data)
 *   POST   = Create (Send new data)
 *   PUT    = Update (Replace existing data)
 *   PATCH  = Partial Update
 *   DELETE = Remove
 * 
 * URL STRUCTURE:
 * /api/v1/resource → Collection of resources
 * /api/v1/resource/:id → Single resource
 */
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/comments', commentRoutes);
app.use('/api/v1/likes', likeRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===========================================
// ERROR HANDLING MIDDLEWARE
// ===========================================
/**
 * WHAT IS ERROR HANDLING MIDDLEWARE?
 * - Special middleware with 4 parameters (err, req, res, next)
 * - Catches errors from all routes and middleware
 * - Provides centralized error handling
 * 
 * WHY WE NEED IT:
 * - Consistent error response format
 * - Log errors for debugging
 * - Hide sensitive error details in production
 * 
 * LEARNING: Error Propagation in Express
 * - When next(error) is called, Express skips to error middleware
 * - Unhandled promise rejections need express-async-handler or try-catch
 */
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Don't leak error details in production
  const response = {
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };
  
  res.status(err.statusCode || 500).json(response);
});

// 404 Handler - Must be last!
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// ===========================================
// SERVER STARTUP
// ===========================================
/**
 * STARTUP SEQUENCE:
 * 1. Connect to MongoDB (persistent data)
 * 2. Connect to Redis (caching, queues, pub/sub)
 * 3. Initialize Socket.IO
 * 4. Subscribe to Redis Pub/Sub
 * 5. Start HTTP server
 * 
 * WHY THIS ORDER?
 * - Database must be ready before accepting requests
 * - If DB connection fails, server shouldn't start
 * - Graceful error handling at startup
 */
const PORT = process.env.PORT || 5000;

/**
 * LEARNING: Socket.IO Setup
 * 
 * Socket.IO provides real-time bidirectional communication.
 * 
 * KEY CONCEPTS:
 * 1. Connection: Client connects via WebSocket (with HTTP fallback)
 * 2. Rooms: Group sockets together for targeted messages
 * 3. Events: Custom events for different message types
 * 
 * WHY USE ROOMS?
 * - Each user joins a room with their user ID
 * - To send notification to user "abc", emit to room "user:abc"
 * - Efficient: Only sends to relevant sockets
 */
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

/**
 * Socket.IO Authentication Middleware
 * 
 * LEARNING: Securing WebSocket Connections
 * 
 * Unlike HTTP requests, WebSocket connections are persistent.
 * We need to verify the user at connection time.
 * 
 * HOW IT WORKS:
 * 1. Client sends JWT token in auth object
 * 2. Server validates token
 * 3. If valid, allow connection and store user info
 * 4. If invalid, reject connection
 */
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  try {
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

/**
 * Socket.IO Connection Handler
 * 
 * LEARNING: Real-time User Management
 * 
 * When a user connects:
 * 1. They join a room named after their user ID
 * 2. This room receives all their notifications
 * 3. When they disconnect, they automatically leave all rooms
 */
io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected via WebSocket`);
  
  // Join user-specific room for notifications
  socket.join(`user:${socket.userId}`);
  
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
  });
});

// Make io available globally for other parts of the app
global.io = io;

const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectMongoDB();
    console.log('✅ MongoDB connected');
    
    // Then connect to Redis
    await connectRedis();
    console.log('✅ Redis connected');
    
    // Initialize PubSub service (requires separate Redis connections)
    await PubSubService.initialize();
    console.log('✅ Pub/Sub initialized');
    
    /**
     * LEARNING: Connecting Redis Pub/Sub to Socket.IO
     * 
     * Flow:
     * 1. Something happens (like, comment, etc.)
     * 2. Server publishes to Redis Pub/Sub
     * 3. Subscriber receives the message
     * 4. Socket.IO emits to the user's room
     * 5. User's browser receives real-time update
     * 
     * WHY REDIS PUB/SUB + SOCKET.IO?
     * - Redis Pub/Sub works across multiple server instances
     * - If you have 3 servers, any can publish and all subscribe
     * - Socket.IO handles the browser connection
     */
    await PubSubService.subscribe('notifications', (message) => {
      console.log('Received notification from Redis:', message);
      
      if (message.recipientId) {
        // Send to specific user's room
        io.to(`user:${message.recipientId}`).emit('notification', message);
      }
    });
    console.log('✅ Subscribed to Redis Pub/Sub');
    
    // Start the HTTP server (which includes Socket.IO)
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔌 WebSocket ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1); // Exit with failure code
  }
};

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================
/**
 * WHAT IS GRACEFUL SHUTDOWN?
 * - Proper cleanup when server stops
 * - Close database connections
 * - Finish processing current requests
 * 
 * WHY WE NEED IT:
 * - Prevent data corruption
 * - Release resources properly
 * - Allow load balancers to reroute traffic
 * 
 * SIGNALS:
 * - SIGTERM: Sent by process managers (PM2, Docker)
 * - SIGINT: Sent when you press Ctrl+C
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  const redisClient = getRedisClient();
  if (redisClient) await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  const redisClient = getRedisClient();
  if (redisClient) await redisClient.quit();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
