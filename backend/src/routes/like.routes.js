/**
 * ===========================================
 * LIKE ROUTES
 * ===========================================
 */

const express = require('express');
const router = express.Router();

const {
  toggleLike,
  getLikeStatus,
  getPostLikers,
  getLikeStatusBatch
} = require('../controllers/like.controller');

const { protect } = require('../middleware/auth.middleware');
const { userRateLimitMiddleware } = require('../services/rateLimit.service');

// Toggle like (protected + rate limited)
router.post('/:postId', protect, userRateLimitMiddleware('LIKE'), toggleLike);

// Get like status for a post
router.get('/:postId/status', protect, getLikeStatus);

// Get users who liked a post
router.get('/:postId/users', getPostLikers);

// Batch get like status for multiple posts
router.post('/status-batch', protect, getLikeStatusBatch);

module.exports = router;
