/**
 * ===========================================
 * MONGODB CONNECTION CONFIGURATION
 * ===========================================
 * 
 * WHAT IS MONGODB?
 * - A NoSQL, document-oriented database
 * - Stores data in flexible, JSON-like documents (BSON)
 * - No fixed schema required (schema-less)
 * - Horizontally scalable (sharding)
 * 
 * TRADITIONAL SQL vs MONGODB:
 * SQL Database      |  MongoDB
 * ------------------|------------------
 * Tables            |  Collections
 * Rows              |  Documents
 * Columns           |  Fields
 * Primary Key       |  _id (ObjectId)
 * Foreign Keys      |  References or Embedding
 * Joins             |  $lookup or Embedding
 * 
 * WHEN TO USE MONGODB:
 * ✅ Flexible schema requirements
 * ✅ Large volumes of data
 * ✅ Real-time analytics
 * ✅ Content management systems
 * ✅ Social networks (like RealtimeHub!)
 * 
 * WHEN TO RECONSIDER:
 * ❌ Complex transactions across multiple collections
 * ❌ Strict ACID compliance needed
 * ❌ Heavy relational queries (many joins)
 */

const mongoose = require('mongoose');

/**
 * MONGOOSE - MongoDB ODM (Object Document Mapper)
 * 
 * WHAT IS AN ODM?
 * - Like ORM but for document databases
 * - Provides schema validation
 * - Converts MongoDB documents to JavaScript objects
 * - Includes query building, middleware, and more
 * 
 * WHY WE USE MONGOOSE:
 * 1. Schema enforcement (even though MongoDB is schema-less)
 * 2. Data validation before saving
 * 3. Type casting (strings to dates, etc.)
 * 4. Query helpers and middleware
 * 5. Population (similar to SQL joins)
 */

const connectMongoDB = async () => {
  try {
    /**
     * CONNECTION OPTIONS EXPLAINED:
     * 
     * useNewUrlParser: Uses new MongoDB driver's URL parser
     * - The old parser is deprecated
     * 
     * useUnifiedTopology: Uses new Server Discovery and Monitoring engine
     * - Better handling of server topology changes
     * 
     * maxPoolSize: Maximum number of connections in the pool
     * - Connection pooling reuses connections for efficiency
     * - Too few = requests wait for connections
     * - Too many = server resources exhausted
     * 
     * serverSelectionTimeoutMS: How long to try selecting a server
     * - Important for failover scenarios
     * 
     * socketTimeoutMS: How long a socket stays open while inactive
     */
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to connect for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    await mongoose.connect(process.env.MONGODB_URI, options);

    /**
     * LEARNING: MongoDB Events
     * Mongoose emits events we can listen to for monitoring
     */
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    /**
     * LEARNING: Indexes
     * When connected, ensure indexes are created
     * Indexes speed up queries but slow down writes
     * Always index fields used in queries and unique constraints
     */
    mongoose.connection.on('connected', () => {
      console.log(`MongoDB connected to ${mongoose.connection.name}`);
    });

    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = connectMongoDB;
