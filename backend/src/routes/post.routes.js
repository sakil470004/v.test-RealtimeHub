/**
 * ===========================================
 * POST ROUTES
 * ===========================================
 */

const express = require('express');
const router = express.Router();

// Controller
const {
  createPost,
  getFeed,
  getPost,
  getUserPosts,
  updatePost,
  deletePost
} = require('../controllers/post.controller');

// Middleware
const { protect, optionalAuth } = require('../middleware/auth.middleware');
const { userRateLimitMiddleware } = require('../services/rateLimit.service');

/**
 * LEARNING: Mixed Auth Routes
 * 
 * Feed can be accessed by:
 * - Anonymous users (see public posts)
 * - Logged in users (see posts + like status)
 * 
 * Using optionalAuth: Sets req.user if token provided, but doesn't require it
 */
router.get('/feed', optionalAuth, getFeed);

/**
 * LEARNING: Rate Limiting on Create
 * 
 * Prevent spam by limiting post creation
 * Uses userRateLimitMiddleware → rate:POST_CREATE:userId
 */
router.post('/', protect, userRateLimitMiddleware('POST_CREATE'), createPost);

// Get single post (optional auth for like status)
router.get('/:id', optionalAuth, getPost);

// Get user's posts
router.get('/user/:userId', optionalAuth, getUserPosts);

// Update and delete (protected + ownership check in controller)
router.put('/:id', protect, updatePost);
router.delete('/:id', protect, deletePost);

module.exports = router;
