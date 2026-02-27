/**
 * ===========================================
 * COMMENT MODEL
 * ===========================================
 * 
 * LEARNING: Document Design for Comments
 * 
 * APPROACHES TO STORE COMMENTS:
 * 
 * 1. EMBED IN POST (Not recommended for social apps)
 *    Post: { comments: [{ text, author, ... }] }
 *    Problems:
 *    - Document size limit (16MB in MongoDB)
 *    - Hard to paginate comments
 *    - Updating single comment requires updating entire post
 * 
 * 2. SEPARATE COLLECTION (Our approach) ✅
 *    Comment: { post: ObjectId, text, author, ... }
 *    Benefits:
 *    - Unlimited comments
 *    - Easy pagination
 *    - Independent updates
 *    - Can query comments directly
 * 
 * 3. HYBRID (Good for nested comments)
 *    Separate collection with parent reference for threading
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post', 
    required: [true, 'Comment must belong to a post'],
    index: true // Important! Fast lookup of comments by post
  },
  
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment must have an author'],
    index: true
  },
  
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [500, 'Comment cannot exceed 500 characters']
  },
  
  /**
   * NESTED COMMENTS (Thread support)
   * 
   * parentComment: null → Top-level comment
   * parentComment: ObjectId → Reply to another comment
   * 
   * LEARNING: Self-referencing documents
   * - A document can reference another document of same type
   * - Creates tree/hierarchy structure
   */
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  
  /**
   * Reply count for nested comments
   * Helps UI show "12 replies" without counting
   */
  replyCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  /**
   * Soft delete for comments
   */
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===========================================
// INDEXES
// ===========================================

/**
 * COMPOUND INDEX: post + createdAt
 * 
 * Optimizes the most common query:
 * "Get comments for a post, sorted by date"
 * 
 * Comment.find({ post: postId }).sort({ createdAt: 1 })
 */
commentSchema.index({ post: 1, createdAt: 1 });

/**
 * INDEX: For getting user's comments
 */
commentSchema.index({ author: 1, createdAt: -1 });

/**
 * INDEX: For nested comments
 * "Get replies to a specific comment"
 */
commentSchema.index({ parentComment: 1, createdAt: 1 });

// ===========================================
// MIDDLEWARE
// ===========================================

/**
 * Exclude deleted comments by default
 */
commentSchema.pre(/^find/, function(next) {
  if (!this.getQuery().hasOwnProperty('isDeleted')) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// ===========================================
// STATIC METHODS
// ===========================================

/**
 * Get paginated comments for a post
 * 
 * LEARNING: Two-level comment loading
 * 
 * First load: Top-level comments for the post
 * Second load: Get replies when user clicks "show replies"
 * 
 * This prevents loading entire comment tree upfront
 */
commentSchema.statics.getCommentsForPost = async function(postId, options = {}) {
  const { 
    limit = 10, 
    cursor = null,
    includeReplies = false,
    replyLimit = 3
  } = options;
  
  let query = { 
    post: postId,
    parentComment: null // Only top-level comments
  };
  
  // Cursor-based pagination
  if (cursor) {
    query.createdAt = { $gt: new Date(cursor) }; // Ascending order
  }
  
  let comments = await this.find(query)
    .populate('author', 'username displayName avatar')
    .sort({ createdAt: 1 }) // Oldest first for comments
    .limit(limit + 1);
  
  const hasMore = comments.length > limit;
  comments = hasMore ? comments.slice(0, -1) : comments;
  
  // Optionally include first few replies
  if (includeReplies && comments.length > 0) {
    const commentIds = comments.map(c => c._id);
    const replies = await this.find({
      parentComment: { $in: commentIds }
    })
      .populate('author', 'username displayName avatar')
      .sort({ createdAt: 1 });
    
    // Group replies by parent
    const repliesMap = {};
    replies.forEach(reply => {
      const parentId = reply.parentComment.toString();
      if (!repliesMap[parentId]) {
        repliesMap[parentId] = [];
      }
      if (repliesMap[parentId].length < replyLimit) {
        repliesMap[parentId].push(reply);
      }
    });
    
    // Attach replies to comments
    comments = comments.map(comment => {
      const commentObj = comment.toObject();
      commentObj.replies = repliesMap[comment._id.toString()] || [];
      return commentObj;
    });
  }
  
  return {
    comments,
    hasMore,
    nextCursor: hasMore ? comments[comments.length - 1].createdAt : null
  };
};

/**
 * Get replies for a specific comment
 */
commentSchema.statics.getReplies = async function(commentId, options = {}) {
  const { limit = 10, cursor = null } = options;
  
  let query = { parentComment: commentId };
  
  if (cursor) {
    query.createdAt = { $gt: new Date(cursor) };
  }
  
  const replies = await this.find(query)
    .populate('author', 'username displayName avatar')
    .sort({ createdAt: 1 })
    .limit(limit + 1);
  
  const hasMore = replies.length > limit;
  const data = hasMore ? replies.slice(0, -1) : replies;
  
  return {
    replies: data,
    hasMore,
    nextCursor: hasMore ? data[data.length - 1].createdAt : null
  };
};

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
