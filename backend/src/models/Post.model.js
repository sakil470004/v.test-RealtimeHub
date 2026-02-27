/**
 * ===========================================
 * POST MODEL
 * ===========================================
 * 
 * LEARNING: Data Modeling Decisions
 * 
 * We embed counters (likeCount, commentCount) directly in Post.
 * This is called DENORMALIZATION.
 * 
 * WHY EMBED COUNTERS?
 * - Avoid counting every time (COUNT query is expensive)
 * - Single query gets post + counts
 * - Trade-off: Must update counter when likes/comments change
 * 
 * ALTERNATIVE: Count on demand
 * - Likes.countDocuments({ post: postId })
 * - More accurate but slower
 * - Good for rarely accessed data
 * 
 * OUR APPROACH:
 * - Store counter in post
 * - Update counter when like/comment added
 * - Cache invalidation keeps it accurate
 */

const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  /**
   * LEARNING: ObjectId References
   * 
   * type: mongoose.Schema.Types.ObjectId
   * - References another document
   * - Stores only the ID (24-character hex string)
   * 
   * ref: 'User'
   * - Tells Mongoose which model to use for population
   * - populate('author') will fetch the full user document
   */
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Post must have an author'],
    /**
     * LEARNING: Index on reference fields
     * - Common to query posts by author
     * - Index speeds up: Post.find({ author: userId })
     */
    index: true
  },
  
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    maxlength: [1000, 'Post cannot exceed 1000 characters']
  },
  
  /**
   * EMBEDDED MEDIA ARRAY
   * 
   * LEARNING: Embedding Arrays
   * - Simple related data can be embedded
   * - No need for separate Media collection
   * - Fast retrieval (no joins)
   * - Limited: Array shouldn't grow unbounded
   */
  media: [{
    type: {
      type: String,
      enum: ['image', 'video'],
    },
    url: String,
    thumbnail: String
  }],
  
  /**
   * DENORMALIZED COUNTERS
   * 
   * WHY NOT JUST COUNT LIKES?
   * 
   * Option 1: Count every time (normalized)
   * const likeCount = await Like.countDocuments({ post: postId });
   * Problem: Slow for posts with many likes
   * 
   * Option 2: Store counter (denormalized) ✅
   * const post = await Post.findById(postId);
   * return post.likeCount; // Already there!
   * 
   * WHEN TO UPDATE COUNTER?
   * - User likes post → likeCount++
   * - User unlikes post → likeCount--
   * - Must be atomic to prevent race conditions!
   */
  likeCount: {
    type: Number,
    default: 0,
    min: 0 // Prevent negative counts
  },
  
  commentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  /**
   * VISIBILITY/PRIVACY
   * 
   * LEARNING: Enum validation
   * - Only allows specified values
   * - Mongoose throws error for invalid values
   */
  visibility: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public'
  },
  
  /**
   * TAGS FOR SEARCHABILITY
   * 
   * LEARNING: Array of primitives
   * - Simple array of strings
   * - Can index for fast searches
   */
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  /**
   * SOFT DELETE
   * 
   * LEARNING: Soft vs Hard Delete
   * 
   * Hard Delete: Remove document from database completely
   * await Post.deleteOne({ _id: postId });
   * 
   * Soft Delete: Mark as deleted but keep data
   * await Post.updateOne({ _id: postId }, { isDeleted: true });
   * 
   * WHY SOFT DELETE?
   * - Recover accidentally deleted data
   * - Audit trail / legal requirements
   * - Maintain referential integrity
   * - Analytics on deleted content
   * 
   * QUERIES MUST EXCLUDE DELETED:
   * Post.find({ isDeleted: { $ne: true } })
   */
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===========================================
// COMPOUND INDEXES
// ===========================================
/**
 * LEARNING: Compound Indexes
 * 
 * Index on multiple fields together.
 * Order matters! { author: 1, createdAt: -1 }
 * 
 * This index helps with:
 * 1. Find posts by author, ordered by date
 * 2. Find posts by author only
 * 
 * Does NOT help with:
 * - Find by date only (author must be first in query)
 * 
 * RULE: Index leftmost fields first
 * { a: 1, b: 1, c: 1 } helps queries on:
 * - a
 * - a, b
 * - a, b, c
 * But NOT just b or c alone
 */
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 }); // For feed queries
postSchema.index({ tags: 1 }); // For tag-based searches
// Exclude deleted posts in default queries
postSchema.index({ isDeleted: 1, createdAt: -1 });

// ===========================================
// QUERY MIDDLEWARE
// ===========================================
/**
 * LEARNING: Query Middleware
 * 
 * Runs before/after query execution
 * this refers to the Query object, not the document
 * 
 * USE CASES:
 * - Auto-exclude soft deleted documents
 * - Add default filters
 * - Logging
 * - Modify query before execution
 */

/**
 * Auto-exclude deleted posts from all find queries
 * 
 * Note: Using regex to match all find variants
 * /^find/ matches: find, findOne, findById, findOneAndUpdate, etc.
 */
postSchema.pre(/^find/, function(next) {
  // this is the Query object
  // Only exclude if not explicitly querying deleted
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// ===========================================
// INSTANCE METHODS
// ===========================================

/**
 * Soft delete a post
 */
postSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return await this.save();
};

/**
 * Increment like count atomically
 * 
 * LEARNING: Atomic Operations
 * 
 * WHY NOT this.likeCount++?
 * - Not atomic - can cause race conditions
 * - Two users like at same time:
 *   User A reads count: 5
 *   User B reads count: 5
 *   User A saves: 6
 *   User B saves: 6 (should be 7!)
 * 
 * $inc is ATOMIC:
 * - Database handles increment internally
 * - No race conditions
 * - Always correct count
 */
postSchema.methods.incrementLikes = async function() {
  return await this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { likeCount: 1 } },
    { new: true } // Return updated document
  );
};

postSchema.methods.decrementLikes = async function() {
  return await this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { likeCount: -1 } },
    { new: true }
  );
};

postSchema.methods.incrementComments = async function() {
  return await this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { commentCount: 1 } },
    { new: true }
  );
};

postSchema.methods.decrementComments = async function() {
  return await this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { commentCount: -1 } },
    { new: true }
  );
};

// ===========================================
// STATIC METHODS
// ===========================================

/**
 * Get paginated feed
 * 
 * LEARNING: Pagination
 * 
 * WHY PAGINATE?
 * - Can't load all posts at once (too many)
 * - Users only see a few at a time
 * - Better performance and UX
 * 
 * PAGINATION METHODS:
 * 
 * 1. SKIP-LIMIT (Offset Pagination) - Simple but has issues
 *    .skip(page * limit).limit(limit)
 *    Problem: Skip is slow on large datasets
 *    Problem: If new posts added, items may appear twice
 * 
 * 2. CURSOR-BASED (Keyset Pagination) - Better for feeds ✅
 *    .find({ createdAt: { $lt: lastSeenDate } }).limit(limit)
 *    Pros: Fast, consistent even with new data
 *    Cons: Can only go forward/backward, not to specific page
 * 
 * We'll implement both for learning!
 */
postSchema.statics.getFeed = async function(options = {}) {
  const {
    limit = 10,
    page = 1,
    cursor = null, // For cursor-based pagination
    userId = null  // For personalized feed
  } = options;
  
  let query = { visibility: 'public' };
  
  // Cursor-based pagination (recommended)
  if (cursor) {
    query.createdAt = { $lt: new Date(cursor) };
  }
  
  const posts = await this.find(query)
    .populate('author', 'username displayName avatar')
    .sort({ createdAt: -1 })
    .limit(limit + 1); // Fetch one extra to check if more exist
  
  const hasMore = posts.length > limit;
  const data = hasMore ? posts.slice(0, -1) : posts;
  
  return {
    posts: data,
    hasMore,
    nextCursor: hasMore ? data[data.length - 1].createdAt : null
  };
};

/**
 * Get user's posts with pagination
 */
postSchema.statics.getByUser = async function(userId, options = {}) {
  const { limit = 10, cursor = null } = options;
  
  let query = { author: userId };
  
  if (cursor) {
    query.createdAt = { $lt: new Date(cursor) };
  }
  
  const posts = await this.find(query)
    .populate('author', 'username displayName avatar')
    .sort({ createdAt: -1 })
    .limit(limit + 1);
  
  const hasMore = posts.length > limit;
  const data = hasMore ? posts.slice(0, -1) : posts;
  
  return {
    posts: data,
    hasMore,
    nextCursor: hasMore ? data[data.length - 1].createdAt : null
  };
};

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
