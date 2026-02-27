/**
 * ===========================================
 * AUTHENTICATION ROUTES
 * ===========================================
 */

const express = require('express');
const router = express.Router();

// Controller
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword
} = require('../controllers/auth.controller');

// Middleware
const { protect } = require('../middleware/auth.middleware');
const { ipRateLimitMiddleware } = require('../services/rateLimit.service');

/**
 * LEARNING: Route Organization
 * 
 * Group related routes together
 * Apply middleware at route level for granular control
 */

// Public routes (no auth required)
router.post('/register', register);

/**
 * LEARNING: Rate Limiting on Login
 * 
 * Critical for security!
 * Prevents brute force password attacks
 */
router.post('/login', ipRateLimitMiddleware('LOGIN'), login);

// Protected routes (auth required)
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);

module.exports = router;
