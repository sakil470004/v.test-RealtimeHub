/**
 * ===========================================
 * NOTIFICATION ROUTES
 * ===========================================
 */

const express = require('express');
const router = express.Router();

const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} = require('../controllers/notification.controller');

const { protect } = require('../middleware/auth.middleware');

// All notification routes are protected
router.use(protect);

// Get notifications
router.get('/', getNotifications);

// Get unread count
router.get('/count', getUnreadCount);

// Mark specific notifications as read
router.put('/read', markAsRead);

// Mark all as read
router.put('/read-all', markAllAsRead);

module.exports = router;
