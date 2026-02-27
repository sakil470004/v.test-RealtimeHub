/**
 * ===========================================
 * NOTIFICATION MODEL
 * ===========================================
 * 
 * LEARNING: Notification System Design
 * 
 * NOTIFICATION TYPES:
 * - like: Someone liked your post
 * - comment: Someone commented on your post
 * - follow: Someone followed you
 * - mention: Someone mentioned you
 * 
 * DATA MODEL DECISIONS:
 * 
 * 1. Who is this notification FOR? → recipient
 * 2. Who TRIGGERED it? → sender
 * 3. What type is it? → type
 * 4. What is it about? → post, comment (optional references)
 * 5. Has user seen it? → isRead
 * 
 * DENORMALIZATION IN NOTIFICATIONS:
 * 
 * We store some sender info directly (senderName, senderAvatar)
 * 
 * WHY?
 * - Notifications are read-heavy, rarely updated
 * - Avoid join/populate for every notification
 * - If user changes name, old notifications keep old name (acceptable)
 * - It's a SNAPSHOT of what happened
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  /**
   * The user who RECEIVES the notification
   * Most queries will be: "Get notifications for user X"
   */
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Notification must have a recipient'],
    index: true // Important! Most queries filter by recipient
  },
  
  /**
   * The user who TRIGGERED the notification
   * e.g., The user who liked your post
   */
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Notification must have a sender']
  },
  
  /**
   * DENORMALIZED SENDER INFO (Optimization)
   * 
   * Stored at notification creation time
   * Avoids population in most cases
   */
  senderName: {
    type: String,
    required: true
  },
  senderAvatar: {
    type: String
  },
  
  /**
   * NOTIFICATION TYPE
   * 
   * LEARNING: Enum for type safety
   * Only these values are allowed
   */
  type: {
    type: String,
    enum: ['like', 'comment', 'follow', 'mention'],
    required: [true, 'Notification must have a type']
  },
  
  /**
   * REFERENCE TO RELATED ENTITIES
   * 
   * These are optional because not all notifications have them:
   * - like → has post
   * - comment → has post AND comment
   * - follow → no post or comment
   */
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  
  /**
   * PRE-RENDERED MESSAGE
   * 
   * LEARNING: Pre-compute notification text
   * 
   * Instead of:
   * "{{sender.name}} liked your post"
   * 
   * We store:
   * "John Doe liked your post"
   * 
   * WHY?
   * - Faster rendering
   * - Message is a snapshot of the moment
   * - Can include post preview
   */
  message: {
    type: String,
    required: [true, 'Notification must have a message']
  },
  
  /**
   * READ STATUS
   * 
   * isRead: false → Show as unread (highlight, badge)
   * isRead: true → User has seen this
   * 
   * readAt: When user marked it as read
   */
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  
  /**
   * ADDITIONAL DATA
   * 
   * Flexible field for extra info
   * e.g., Post preview, comment text snippet
   */
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
 * PRIMARY INDEX: Get user's notifications
 * 
 * Query: "Get John's unread notifications, newest first"
 * Notification.find({ recipient: johnId, isRead: false })
 *             .sort({ createdAt: -1 })
 * 
 * Index: { recipient: 1, isRead: 1, createdAt: -1 }
 * This compound index handles all these filters efficiently
 */
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

/**
 * INDEX: For unread count queries
 * "How many unread notifications does John have?"
 * Notification.countDocuments({ recipient: johnId, isRead: false })
 */
notificationSchema.index({ recipient: 1, isRead: 1 });

/**
 * INDEX: For cleanup/deletion of old notifications
 * "Delete notifications older than 30 days"
 */
notificationSchema.index({ createdAt: 1 });

/**
 * INDEX: Prevent duplicate notifications
 * 
 * Don't notify multiple times for same action:
 * "John liked your post" → should only appear once
 * 
 * Note: Using partial unique index might be better
 * But for simplicity, we'll check in application code
 */
notificationSchema.index({ recipient: 1, sender: 1, type: 1, post: 1 });

// ===========================================
// STATIC METHODS
// ===========================================

/**
 * Create a notification with proper message
 * 
 * LEARNING: Factory method pattern
 * Encapsulates notification creation logic
 */
notificationSchema.statics.createNotification = async function(data) {
  const { type, recipient, sender, post, comment, metadata } = data;
  
  // Don't notify yourself
  if (recipient.toString() === sender._id.toString()) {
    return null;
  }
  
  // Generate message based on type
  let message;
  switch (type) {
    case 'like':
      message = `${sender.displayName || sender.username} liked your post`;
      break;
    case 'comment':
      message = `${sender.displayName || sender.username} commented on your post`;
      break;
    case 'follow':
      message = `${sender.displayName || sender.username} started following you`;
      break;
    case 'mention':
      message = `${sender.displayName || sender.username} mentioned you`;
      break;
    default:
      message = 'You have a new notification';
  }
  
  // Check for duplicate (within last hour)
  const existingNotification = await this.findOne({
    recipient,
    sender: sender._id,
    type,
    post: post || undefined,
    createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) }
  });
  
  if (existingNotification) {
    return existingNotification; // Return existing instead of creating duplicate
  }
  
  return await this.create({
    recipient,
    sender: sender._id,
    senderName: sender.displayName || sender.username,
    senderAvatar: sender.avatar,
    type,
    post,
    comment,
    message,
    metadata
  });
};

/**
 * Get user's notifications with pagination
 */
notificationSchema.statics.getForUser = async function(userId, options = {}) {
  const {
    limit = 20,
    cursor = null,
    unreadOnly = false
  } = options;
  
  let query = { recipient: userId };
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  if (cursor) {
    query.createdAt = { $lt: new Date(cursor) };
  }
  
  const notifications = await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit + 1);
  
  const hasMore = notifications.length > limit;
  const data = hasMore ? notifications.slice(0, -1) : notifications;
  
  return {
    notifications: data,
    hasMore,
    nextCursor: hasMore ? data[data.length - 1].createdAt : null
  };
};

/**
 * Get unread count for user
 * 
 * LEARNING: countDocuments vs estimatedDocumentCount
 * 
 * countDocuments({ query }): Accurate count with filter - Uses index
 * estimatedDocumentCount(): Fast estimate of total docs - No filter
 * 
 * For notifications, we need exact count, so use countDocuments
 */
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    recipient: userId,
    isRead: false
  });
};

/**
 * Mark notifications as read
 * 
 * Can mark:
 * - Single notification by ID
 * - All notifications for a user
 */
notificationSchema.statics.markAsRead = async function(userId, notificationIds = null) {
  const query = { recipient: userId, isRead: false };
  
  if (notificationIds && notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }
  
  const result = await this.updateMany(query, {
    $set: { isRead: true, readAt: new Date() }
  });
  
  return result.modifiedCount;
};

/**
 * Mark all as read for user
 */
notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.markAsRead(userId);
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
