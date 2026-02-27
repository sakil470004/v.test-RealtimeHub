/**
 * ===========================================
 * COMMENT ROUTES
 * ===========================================
 */

const express = require('express');
const router = express.Router();

const {
  createComment,
  getPostComments,
  getCommentReplies,
  updateComment,
  deleteComment
} = require('../controllers/comment.controller');

const { protect } = require('../middleware/auth.middleware');
const { userRateLimitMiddleware } = require('../services/rateLimit.service');

// Get comments for a post (public)
router.get('/:postId', getPostComments);

// Get replies to a comment
router.get('/:commentId/replies', getCommentReplies);

// Create comment (protected + rate limited)
router.post('/:postId', protect, userRateLimitMiddleware('COMMENT_CREATE'), createComment);

// Update comment
router.put('/:id', protect, updateComment);

// Delete comment
router.delete('/:id', protect, deleteComment);

module.exports = router;
