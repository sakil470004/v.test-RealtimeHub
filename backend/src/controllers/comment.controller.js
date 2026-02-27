/**
 * ===========================================
 * COMMENT CONTROLLER
 * ===========================================
 */

const Comment = require('../models/Comment.model');
const Post = require('../models/Post.model');
const { CacheService } = require('../services/cache.service');
const { QueueService } = require('../services/queue.service');

/**
 * CREATE COMMENT
 * POST /api/v1/comments/:postId
 */
const createComment = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { content, parentComment } = req.body;
    const userId = req.user._id;
    
    // Verify post exists
    const post = await Post.findById(postId).populate('author', '_id username displayName');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    
    // If reply, verify parent comment exists
    if (parentComment) {
      const parent = await Comment.findById(parentComment);
      if (!parent || parent.post.toString() !== postId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent comment'
        });
      }
    }
    
    // Create comment
    const comment = await Comment.create({
      post: postId,
      author: userId,
      content,
      parentComment: parentComment || null
    });
    
    // Populate author for response
    await comment.populate('author', 'username displayName avatar');
    
    // Update counters atomically
    if (parentComment) {
      // Increment reply count on parent comment
      await Comment.findByIdAndUpdate(parentComment, {
        $inc: { replyCount: 1 }
      });
    }
    
    // Increment comment count on post
    await post.incrementComments();
    
    /**
     * LEARNING: Cache Invalidation Strategy
     * 
     * Comment added:
     * 1. Invalidate post cache (commentCount changed)
     * 2. Invalidate post's comments cache
     */
    await Promise.all([
      CacheService.invalidatePost(postId),
      CacheService.invalidatePostComments(postId)
    ]);
    
    /**
     * Queue notification if commenting on someone else's post
     */
    if (post.author._id.toString() !== userId.toString()) {
      QueueService.notifyComment({
        postId,
        postAuthorId: post.author._id,
        commenterId: userId,
        commenterName: req.user.displayName || req.user.username,
        commentPreview: content.substring(0, 100)
      }).catch(err => console.error('Failed to queue comment notification:', err));
    }
    
    res.status(201).json({
      success: true,
      message: 'Comment added',
      data: { comment }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET COMMENTS FOR POST
 * GET /api/v1/comments/:postId
 * 
 * LEARNING: Hierarchical Data Fetching
 * 
 * For comments with replies:
 * 1. First load top-level comments
 * 2. Optionally include first few replies
 * 3. Load more replies on demand
 */
const getPostComments = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { cursor, limit = 10, includeReplies = 'true' } = req.query;
    
    // Check cache first
    let cachedComments = await CacheService.getPostComments(postId, cursor);
    
    if (cachedComments) {
      return res.status(200).json({
        success: true,
        data: cachedComments,
        cached: true
      });
    }
    
    // Query from database
    const result = await Comment.getCommentsForPost(postId, {
      cursor,
      limit: parseInt(limit),
      includeReplies: includeReplies === 'true',
      replyLimit: 3
    });
    
    // Cache the result
    await CacheService.setPostComments(postId, cursor, result);
    
    res.status(200).json({
      success: true,
      data: result,
      cached: false
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET REPLIES TO A COMMENT
 * GET /api/v1/comments/:commentId/replies
 */
const getCommentReplies = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { cursor, limit = 10 } = req.query;
    
    const result = await Comment.getReplies(commentId, {
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
 * UPDATE COMMENT
 * PUT /api/v1/comments/:id
 */
const updateComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }
    
    // Check ownership
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this comment'
      });
    }
    
    comment.content = content;
    await comment.save();
    await comment.populate('author', 'username displayName avatar');
    
    // Invalidate cache
    await CacheService.invalidatePostComments(comment.post);
    
    res.status(200).json({
      success: true,
      message: 'Comment updated',
      data: { comment }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE COMMENT
 * DELETE /api/v1/comments/:id
 */
const deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }
    
    // Check ownership
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment'
      });
    }
    
    // Soft delete
    comment.isDeleted = true;
    await comment.save();
    
    // Decrement counters
    const post = await Post.findById(comment.post);
    if (post) {
      await post.decrementComments();
    }
    
    if (comment.parentComment) {
      await Comment.findByIdAndUpdate(comment.parentComment, {
        $inc: { replyCount: -1 }
      });
    }
    
    // Invalidate caches
    await Promise.all([
      CacheService.invalidatePost(comment.post),
      CacheService.invalidatePostComments(comment.post)
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Comment deleted'
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComment,
  getPostComments,
  getCommentReplies,
  updateComment,
  deleteComment
};
