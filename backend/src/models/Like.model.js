/**
 * ===========================================
 * LIKE MODEL
 * ===========================================
 * 
 * LEARNING: Unique Constraints in MongoDB
 * 
 * PROBLEM: Prevent duplicate likes
 * - User should only like a post once
 * - Without constraint: Can insert duplicate likes
 * 
 * SOLUTION: Compound Unique Index
 * - { user: 1, post: 1 }, unique: true
 * - MongoDB will reject duplicate user+post combinations
 * 
 * WHY SEPARATE COLLECTION?
 * 
 * Option 1: Store likes as array in Post
 * Post: { likes: [userId1, userId2, ...] }
 * Problems:
 * - Document size grows unbounded
 * - Array contains 1M userIds = huge document
 * - Checking if user liked = scan entire array
 * 
 * Option 2: Separate Likes collection ✅
 * Like: { user, post, createdAt }
 * Benefits:
 * - Unlimited likes
 * - Fast lookup: Did user X like post Y?
 * - Easy to get users who liked a post
 * - Timestamp: Know WHEN user liked
 */

const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Like must belong to a user']
  },
  
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Like must belong to a post']
  }
}, {
  timestamps: true
});

// ===========================================
// UNIQUE COMPOUND INDEX - The Key Part!
// ===========================================
/**
 * LEARNING: Compound Unique Index
 * 
 * This is the MOST IMPORTANT part of the Like model!
 * 
 * { user: 1, post: 1 }, unique: true
 * 
 * What this does:
 * - Creates an index on user AND post together
 * - Enforces uniqueness on the COMBINATION
 * 
 * Examples:
 * ✅ { user: "A", post: "X" } → Allowed
 * ✅ { user: "A", post: "Y" } → Allowed (same user, different post)
 * ✅ { user: "B", post: "X" } → Allowed (different user, same post)
 * ❌ { user: "A", post: "X" } → REJECTED! (duplicate)
 * 
 * MongoDB throws error: E11000 duplicate key error
 * 
 * WHY UNIQUE INDEX vs APPLICATION CHECK?
 * 
 * Application-level check (BAD):
 * const existing = await Like.findOne({ user, post });
 * if (existing) return error;
 * await Like.create({ user, post });
 * 
 * Problem: Race condition!
 * - User double-clicks like button
 * - Both requests pass the check (no existing like found)
 * - Both create a like = DUPLICATE!
 * 
 * Database-level constraint (GOOD):
 * - Atomic check + insert
 * - No race conditions possible
 * - Second insert fails immediately
 */
likeSchema.index({ user: 1, post: 1 }, { unique: true });

/**
 * Additional indexes for common queries
 */
// Find all likes by a user
likeSchema.index({ user: 1, createdAt: -1 });

// Find all likes on a post
likeSchema.index({ post: 1, createdAt: -1 });

// ===========================================
// STATIC METHODS
// ===========================================

/**
 * Toggle like (like/unlike)
 * 
 * LEARNING: Upsert and Delete pattern
 * 
 * This is a common pattern for toggles:
 * - If exists → Delete
 * - If not exists → Create
 * 
 * Returns: { liked: boolean, likeDoc: Like|null }
 */
likeSchema.statics.toggleLike = async function(userId, postId) {
  // Check if like exists
  const existingLike = await this.findOne({ user: userId, post: postId });
  
  if (existingLike) {
    // Unlike: Remove the like
    await this.deleteOne({ _id: existingLike._id });
    return { liked: false, likeDoc: null };
  } else {
    // Like: Create new like
    // If duplicate (race condition), unique index catches it
    try {
      const newLike = await this.create({ user: userId, post: postId });
      return { liked: true, likeDoc: newLike };
    } catch (error) {
      /**
       * LEARNING: Handling Duplicate Key Error
       * 
       * If two requests hit simultaneously:
       * - First succeeds
       * - Second gets E11000 error
       * 
       * We treat this as "already liked" - return success
       * No need to show error to user
       */
      if (error.code === 11000) {
        // Duplicate key - like already exists
        const like = await this.findOne({ user: userId, post: postId });
        return { liked: true, likeDoc: like };
      }
      throw error;
    }
  }
};

/**
 * Check if user has liked a post
 * 
 * Important for UI: Show filled heart if liked
 */
likeSchema.statics.hasUserLiked = async function(userId, postId) {
  const like = await this.findOne({ user: userId, post: postId });
  return !!like;
};

/**
 * Check if user has liked multiple posts
 * 
 * LEARNING: Batch checking likes
 * 
 * When showing a feed of posts, you need to know:
 * "Which of these 10 posts has the current user liked?"
 * 
 * BAD: 10 separate queries
 * for (const post of posts) {
 *   const liked = await Like.hasUserLiked(userId, post._id);
 * }
 * 
 * GOOD: One query with $in ✅
 * const likes = await Like.find({
 *   user: userId,
 *   post: { $in: postIds }
 * });
 */
likeSchema.statics.getLikedPostIds = async function(userId, postIds) {
  const likes = await this.find({
    user: userId,
    post: { $in: postIds }
  }).select('post');
  
  // Return Set for O(1) lookup
  return new Set(likes.map(like => like.post.toString()));
};

/**
 * Get users who liked a post (with pagination)
 */
likeSchema.statics.getPostLikers = async function(postId, options = {}) {
  const { limit = 20, cursor = null } = options;
  
  let query = { post: postId };
  
  if (cursor) {
    query.createdAt = { $lt: new Date(cursor) };
  }
  
  const likes = await this.find(query)
    .populate('user', 'username displayName avatar')
    .sort({ createdAt: -1 })
    .limit(limit + 1);
  
  const hasMore = likes.length > limit;
  const data = hasMore ? likes.slice(0, -1) : likes;
  
  return {
    users: data.map(like => like.user),
    hasMore,
    nextCursor: hasMore ? data[data.length - 1].createdAt : null
  };
};

const Like = mongoose.model('Like', likeSchema);

module.exports = Like;
