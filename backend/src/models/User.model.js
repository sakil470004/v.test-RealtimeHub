/**
 * ===========================================
 * USER MODEL
 * ===========================================
 * 
 * WHAT IS A SCHEMA?
 * - Defines the structure of documents in a collection
 * - Specifies field types, validations, defaults
 * - Even though MongoDB is "schema-less", Mongoose enforces structure
 * 
 * WHY USE SCHEMAS?
 * - Data validation before saving
 * - Type casting (string "123" → number 123)
 * - Default values
 * - Required fields enforcement
 * - Clean, predictable data structure
 * 
 * SCHEMA TYPES IN MONGOOSE:
 * - String, Number, Boolean, Date
 * - Buffer (binary data)
 * - ObjectId (reference to another document)
 * - Array
 * - Mixed (any type)
 * - Map
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * LEARNING: Schema Definition
 * 
 * Each field can have:
 * - type: Data type (required)
 * - required: Validation
 * - unique: Creates unique index
 * - default: Default value
 * - trim: Remove whitespace
 * - lowercase: Convert to lowercase
 * - minlength/maxlength: String length validation
 * - min/max: Number range validation
 * - enum: Allowed values
 * - match: Regex pattern validation
 */
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true, // Creates a unique index
    trim: true,   // Removes whitespace: "  john  " → "john"
    lowercase: true, // Converts to lowercase: "John" → "john"
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    /**
     * LEARNING: Regex Validation
     * - match accepts a regex pattern
     * - Username: alphanumeric and underscores only
     */
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    /**
     * LEARNING: Email Regex
     * This is a simplified email regex.
     * For production, consider using a library like 'validator'.
     */
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    /**
     * LEARNING: select: false
     * 
     * By default, this field is NOT included in query results.
     * Must explicitly select it: User.findById(id).select('+password')
     * 
     * WHY?
     * - Security: Don't accidentally expose passwords
     * - Performance: Don't fetch data you don't need
     */
    select: false
  },
  
  displayName: {
    type: String,
    trim: true,
    maxlength: [50, 'Display name cannot exceed 50 characters']
  },
  
  avatar: {
    type: String,
    default: 'default-avatar.png'
  },
  
  bio: {
    type: String,
    maxlength: [200, 'Bio cannot exceed 200 characters']
  },
  
  /**
   * LEARNING: Embedded vs Referenced Data
   * 
   * EMBEDDING (denormalization):
   * - Store related data inside the document
   * - Faster reads (no joins)
   * - Good for: Data that's always accessed together
   * - Risk: Data duplication if embedded data is shared
   * 
   * REFERENCING (normalization):
   * - Store just the ObjectId reference
   * - Requires population (separate query)
   * - Good for: Large or independently accessed data
   * 
   * Below: We store follower counts (embedding counters)
   * But we don't embed the actual followers (would be huge!)
   */
  followersCount: {
    type: Number,
    default: 0
  },
  
  followingCount: {
    type: Number,
    default: 0
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  lastLoginAt: {
    type: Date
  }
}, {
  /**
   * SCHEMA OPTIONS
   * 
   * timestamps: true
   * - Automatically adds createdAt and updatedAt fields
   * - createdAt: Set once when document is created
   * - updatedAt: Updated on every save
   * 
   * toJSON/toObject: Transform options
   * - virtuals: true includes virtual fields
   * - versionKey: false removes __v field
   */
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===========================================
// INDEXES
// ===========================================
/**
 * WHAT ARE INDEXES?
 * - Data structures that improve query speed
 * - Like an index in a book - find pages faster
 * - Without index: Full collection scan (slow!)
 * - With index: Direct lookup (fast!)
 * 
 * WHEN TO CREATE INDEXES:
 * ✅ Fields used in queries frequently
 * ✅ Fields used in sorting
 * ✅ Unique constraints
 * 
 * TRADE-OFFS:
 * - Faster reads, slower writes
 * - Uses additional storage
 * - Too many indexes = wasted resources
 * 
 * INDEX TYPES:
 * - Single field: { email: 1 }
 * - Compound: { username: 1, createdAt: -1 }
 * - Text: For full-text search
 * - Geospatial: For location queries
 * 
 * DIRECTION (1 or -1):
 * - 1: Ascending order
 * - -1: Descending order
 * - Matters for range queries and sorting
 */
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 }); // Recent users first

// ===========================================
// MIDDLEWARE (HOOKS)
// ===========================================
/**
 * WHAT IS MIDDLEWARE IN MONGOOSE?
 * - Functions that run at specific stages of the document lifecycle
 * - Similar to Express middleware but for database operations
 * 
 * TYPES:
 * 1. Document Middleware: 'save', 'validate', 'remove'
 * 2. Query Middleware: 'find', 'findOne', 'updateOne'
 * 3. Aggregate Middleware: 'aggregate'
 * 
 * HOOKS:
 * - pre: Runs BEFORE the operation
 * - post: Runs AFTER the operation
 * 
 * COMMON USE CASES:
 * - Hash password before save
 * - Log operations
 * - Validate complex business rules
 * - Update related documents
 */

/**
 * PRE-SAVE MIDDLEWARE: Hash Password
 * 
 * WHAT IS PASSWORD HASHING?
 * - Converting password to irreversible string
 * - Even if database is compromised, passwords are safe
 * - Cannot reverse hash back to password
 * 
 * BCRYPT:
 * - Industry standard for password hashing
 * - Includes salt (random data) automatically
 * - Configurable work factor (cost)
 * 
 * WHAT IS SALT?
 * - Random data added to password before hashing
 * - Same password → Different hashes (due to different salts)
 * - Protects against rainbow table attacks
 * 
 * WHAT ARE SALT ROUNDS?
 * - Number of iterations (2^rounds)
 * - 10 rounds = 2^10 = 1024 iterations
 * - Higher = More secure but slower
 * - 10-12 is recommended for most apps
 */
userSchema.pre('save', async function(next) {
  /**
   * IMPORTANT: Only hash if password is modified
   * 
   * this.isModified('password') checks if:
   * - New document (password is set for first time)
   * - Password field was changed
   * 
   * Without this check, password would be re-hashed on every save!
   * Hash of hash of hash... = wrong password!
   */
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ===========================================
// INSTANCE METHODS
// ===========================================
/**
 * WHAT ARE INSTANCE METHODS?
 * - Methods available on document instances
 * - Define using schema.methods
 * - Access document data with 'this'
 * 
 * Example:
 * const user = await User.findById(id);
 * await user.comparePassword('password123');
 */

/**
 * COMPARE PASSWORD METHOD
 * 
 * WHY NOT JUST COMPARE STRINGS?
 * - Passwords are hashed, can't compare directly
 * - bcrypt.compare handles:
 *   1. Extracting salt from stored hash
 *   2. Hashing input with same salt
 *   3. Comparing the hashes
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  /**
   * LEARNING: Why we need select('+password')
   * 
   * Password field has select: false
   * So 'this.password' would be undefined normally
   * Must query with: User.findById(id).select('+password')
   */
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate safe user object (remove sensitive data)
 * 
 * WHY?
 * - Never send password hash to client
 * - Never send sensitive internal data
 * - Create a "public" version of user data
 */
userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    displayName: this.displayName,
    avatar: this.avatar,
    bio: this.bio,
    followersCount: this.followersCount,
    followingCount: this.followingCount,
    createdAt: this.createdAt
  };
};

// ===========================================
// STATIC METHODS
// ===========================================
/**
 * WHAT ARE STATIC METHODS?
 * - Methods available on the Model itself
 * - Define using schema.statics
 * - Don't have access to 'this' document
 * 
 * INSTANCE vs STATIC:
 * Instance: user.comparePassword() - on a document
 * Static: User.findByEmail() - on the Model
 */

/**
 * Find user by email with password included
 * 
 * Convenience method for login
 */
userSchema.statics.findByEmailWithPassword = function(email) {
  return this.findOne({ email }).select('+password');
};

// ===========================================
// VIRTUALS
// ===========================================
/**
 * WHAT ARE VIRTUALS?
 * - Properties that are NOT stored in MongoDB
 * - Computed on-the-fly when you access them
 * - Good for: Derived data, formatting, computed fields
 * 
 * WHY USE VIRTUALS?
 * - Don't waste storage on computed values
 * - Always up-to-date (computed each time)
 * - Can combine multiple fields
 */
userSchema.virtual('fullName').get(function() {
  return this.displayName || this.username;
});

/**
 * VIRTUAL POPULATE
 * 
 * Get user's posts without storing post IDs in user document
 * Posts model has 'author' field referencing User
 * This virtual creates a "reverse reference"
 */
userSchema.virtual('posts', {
  ref: 'Post',
  localField: '_id',      // Field in User
  foreignField: 'author', // Field in Post that references User
});

// Create and export the model
const User = mongoose.model('User', userSchema);

module.exports = User;
