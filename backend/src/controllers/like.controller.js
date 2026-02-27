/**
 * ===========================================
 * LIKE CONTROLLER
 * ===========================================
 * 
 * Demonstrates:
 * - Toggle pattern (like/unlike)
 * - Unique constraints
 * - Counter updates with atomic operations
 * - Cache invalidation
 * - Notification queue
 */

const Like = require('../models/Like.model');
const Post = require('../models/Post.model');
const { CacheService } = require('../services/cache.service');
const { QueueService } = require('../services/queue.service');
const { PubSubService } = require('../services/pubsub.service');

/**
 * TOGGLE LIKE
 * POST /api/v1/likes/:postId
 * 
 * LEARNING: Toggle Pattern
 * 
 * Instead of separate like/unlike endpoints:
 * - One endpoint handles both
 * - Check current state
 * - Toggle to opposite
 * 
 * Benefits:
 * - Simpler API
 * - No need to track state on client
 * - Matches UI pattern (click = toggle)
 */
const toggleLike = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    // Verify post exists
    const post = await Post.findById(postId).populate('author', 'username displayName avatar');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    
    /**
     * LEARNING: Toggle Operation
     * 
     * Like.toggleLike handles:
     * 1. Check if like exists
     * 2. If exists → delete (unlike)
     * 3. If not exists → create (like)
     * 4. Return result
     * 
     * Uses unique index to prevent duplicates
     */
    const { liked, likeDoc } = await Like.toggleLike(userId, postId);
    
    /**
     * LEARNING: Atomic Counter Update
     * 
     * Must update post's likeCount:
     * - +1 if liked
     * - -1 if unliked
     * 
     * Using atomic $inc to prevent race conditions
     */
    let updatedPost;
    if (liked) {
      updatedPost = await post.incrementLikes();
    } else {
      updatedPost = await post.decrementLikes();
    }
    
    /**
     * LEARNING: Cache Invalidation
     * 
     * Like changed post data (likeCount)
     * Must invalidate post cache
     */
    await CacheService.invalidatePost(postId);
    
    /**
     * LEARNING: Async Notification via Queue
     * 
     * If user liked (not unliked):
     * - Add notification job to queue
     * - Worker will process it
     * - Don't make user wait!
     */
    if (liked && post.author._id.toString() !== userId.toString()) {
      // Don't await - fire and forget
      QueueService.notifyLike({
        postId,
        postAuthorId: post.author._id,
        likerId: userId,
        likerName: req.user.displayName || req.user.username
      }).catch(err => console.error('Failed to queue like notification:', err));
      
      /**
       * LEARNING: Real-time Update via Pub/Sub
       * 
       * Also publish to post's channel for real-time updates
       * Users viewing this post will see like count change
       */
      PubSubService.publishPostActivity(postId, {
        type: 'like',
        likeCount: updatedPost.likeCount,
        action: 'increment'
      }).catch(err => console.error('Failed to publish post activity:', err));
    }
    
    res.status(200).json({
      success: true,
      data: {
        liked,
        likeCount: updatedPost.likeCount
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * CHECK IF USER LIKED POST
 * GET /api/v1/likes/:postId/status
 */
const getLikeStatus = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    const liked = await Like.hasUserLiked(userId, postId);
    
    res.status(200).json({
      success: true,
      data: { liked }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET USERS WHO LIKED A POST
 * GET /api/v1/likes/:postId/users
 */
const getPostLikers = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { cursor, limit = 20 } = req.query;
    
    const result = await Like.getPostLikers(postId, {
      cursor,
      limit: parseInt(limit)
    });
    
    res.status(200).json({
      success: true,
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET LIKE STATUS FOR MULTIPLE POSTS
 * POST /api/v1/likes/status-batch
 * 
 * LEARNING: Batch API for Efficiency
 * 
 * When loading a feed with 10 posts, need to know
 * which ones user has liked.
 * 
 * BAD: 10 separate API calls
 * GOOD: 1 batch API call with all post IDs
 */
const getLikeStatusBatch = async (req, res, next) => {
  try {
    const { postIds } = req.body;
    const userId = req.user._id;
    
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'postIds must be a non-empty array'
      });
    }
    
    // Limit batch size to prevent abuse
    if (postIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 posts per batch'
      });
    }
    
    const likedPostIds = await Like.getLikedPostIds(userId, postIds);
    
    // Convert Set to object for easy lookup
    const likeStatus = {};
    postIds.forEach(id => {
      likeStatus[id] = likedPostIds.has(id.toString());
    });
    
    res.status(200).json({
      success: true,
      data: { likeStatus }
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  toggleLike,
  getLikeStatus,
  getPostLikers,
  getLikeStatusBatch
};
