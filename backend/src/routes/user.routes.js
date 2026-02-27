/**
 * ===========================================
 * USER ROUTES
 * ===========================================
 * 
 * Routes for user profile operations
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const User = require('../models/User');
const Post = require('../models/Post');
const cacheService = require('../services/cache.service');

/**
 * GET /api/v1/users/:userId
 * Get user profile
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Try cache first
    const cacheKey = `user:${userId}`;
    const cached = await cacheService.get(cacheKey);
    
    if (cached) {
      return res.status(200).json({
        success: true,
        data: { user: cached },
        fromCache: true
      });
    }
    
    // Find user
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get posts count
    const postsCount = await Post.countDocuments({ author: userId });
    
    const userData = {
      ...user.toObject(),
      postsCount
    };
    
    // Cache the result
    await cacheService.set(cacheKey, userData, 300); // 5 minutes
    
    res.status(200).json({
      success: true,
      data: { user: userData }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/users/profile
 * Update own profile
 */
router.put('/profile', protect, async (req, res, next) => {
  try {
    const { username, bio, avatar } = req.body;
    
    const updates = {};
    if (username) updates.username = username;
    if (bio !== undefined) updates.bio = bio;
    if (avatar) updates.avatar = avatar;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    // Invalidate cache
    await cacheService.delete(`user:${req.user._id}`);
    
    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
