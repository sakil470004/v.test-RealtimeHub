/**
 * ===========================================
 * NOTIFICATION CONTROLLER
 * ===========================================
 */

const Notification = require('../models/Notification.model');
const { CacheService } = require('../services/cache.service');

/**
 * GET USER'S NOTIFICATIONS
 * GET /api/v1/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { cursor, limit = 20, unreadOnly = 'false' } = req.query;
    
    const result = await Notification.getForUser(userId, {
      cursor,
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
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
 * GET UNREAD COUNT
 * GET /api/v1/notifications/count
 * 
 * LEARNING: Cached Counter
 * 
 * This endpoint is called frequently (every page load)
 * Cache the count for performance
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Check cache first
    let count = await CacheService.getNotificationCount(userId);
    
    if (count === null) {
      // Cache miss - query database
      count = await Notification.getUnreadCount(userId);
      
      // Cache for 30 seconds
      await CacheService.setNotificationCount(userId, count);
    }
    
    res.status(200).json({
      success: true,
      data: { count }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * MARK NOTIFICATION(S) AS READ
 * PUT /api/v1/notifications/read
 * 
 * Body: { notificationIds: ['id1', 'id2'] }
 * Or no body to mark all as read
 */
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notificationIds } = req.body;
    
    const updatedCount = await Notification.markAsRead(userId, notificationIds);
    
    // Invalidate count cache
    await CacheService.invalidateNotificationCount(userId);
    
    res.status(200).json({
      success: true,
      message: `${updatedCount} notifications marked as read`,
      data: { updatedCount }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * MARK ALL AS READ
 * PUT /api/v1/notifications/read-all
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    const updatedCount = await Notification.markAllAsRead(userId);
    
    // Invalidate count cache
    await CacheService.invalidateNotificationCount(userId);
    
    res.status(200).json({
      success: true,
      message: `All notifications marked as read`,
      data: { updatedCount }
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
