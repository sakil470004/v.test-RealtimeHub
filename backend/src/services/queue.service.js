/**
 * ===========================================
 * BULLMQ QUEUE SERVICE
 * ===========================================
 * 
 * CORE REDIS LEARNING MODULE
 * 
 * ===========================================
 * WHAT IS A MESSAGE QUEUE?
 * ===========================================
 * 
 * Message Queue = System for asynchronous task processing
 * 
 * WITHOUT QUEUE:
 * Request → Process Everything → Response
 * User waits for everything (slow!)
 * 
 * WITH QUEUE:
 * Request → Quick Response → Background Processing
 * User gets fast response, heavy work happens later
 * 
 * ===========================================
 * WHAT IS BULLMQ?
 * ===========================================
 * 
 * BullMQ = Premium job queue for Node.js based on Redis
 * 
 * FEATURES:
 * - Priority queues
 * - Delayed jobs
 * - Retries with exponential backoff
 * - Job progress tracking
 * - Rate limiting
 * - Concurrent processing
 * - Job dependencies (wait for other jobs)
 * 
 * ===========================================
 * WHY USE QUEUES?
 * ===========================================
 * 
 * 1. FAST API RESPONSES
 *    Don't make users wait for:
 *    - Email sending
 *    - Push notifications
 *    - Report generation
 *    - Image processing
 * 
 * 2. RELIABILITY
 *    - Jobs persist in Redis
 *    - Server restart? Jobs still there
 *    - Job failed? Automatic retry
 * 
 * 3. SCALABILITY
 *    - Multiple workers can process jobs
 *    - Add more workers when load increases
 *    - Workers can be on different machines
 * 
 * 4. DECOUPLING
 *    - API doesn't know how notifications work
 *    - Worker handles the details
 *    - Easy to change notification method later
 * 
 * ===========================================
 * QUEUE ARCHITECTURE
 * ===========================================
 * 
 * PRODUCER (API Server):
 * - Receives user request
 * - Adds job to queue
 * - Responds to user immediately
 * 
 * QUEUE (Redis):
 * - Stores jobs
 * - Manages job state
 * - Handles priorities and delays
 * 
 * CONSUMER (Worker):
 * - Picks jobs from queue
 * - Processes them
 * - Reports success/failure
 * 
 * Flow:
 * User → API → Queue → Worker → (Notification sent!)
 *        ↓
 *   "Success!" (fast!)
 * 
 * ===========================================
 * HOW REDIS STORES QUEUE DATA
 * ===========================================
 * 
 * BullMQ uses multiple Redis data structures:
 * 
 * 1. LISTS - The actual queue
 *    - LPUSH to add job
 *    - BRPOPLPUSH to move job to processing
 * 
 * 2. SORTED SETS - Delayed/Scheduled jobs
 *    - Score = timestamp when job should run
 *    - ZADD to add, ZRANGEBYSCORE to find ready jobs
 * 
 * 3. HASHES - Job data
 *    - Store job details (data, options, state)
 * 
 * 4. SETS - Job IDs by state
 *    - waiting, active, completed, failed
 */

const { Queue, Worker, QueueScheduler, QueueEvents } = require('bullmq');

// Redis connection for BullMQ
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// ===========================================
// QUEUE DEFINITIONS
// ===========================================
/**
 * LEARNING: Queue Naming
 * 
 * Each queue handles a specific type of job
 * Separate queues allow:
 * - Different priorities
 * - Different concurrency settings
 * - Different retry strategies
 * - Easier monitoring
 */

// Notification Queue - For all notification jobs
const notificationQueue = new Queue('notifications', { connection });

// Email Queue - For sending emails
const emailQueue = new Queue('emails', { connection });

// Analytics Queue - For logging and analytics
const analyticsQueue = new Queue('analytics', { connection });

// ===========================================
// JOB TYPES
// ===========================================
/**
 * LEARNING: Job Type Constants
 * 
 * Use constants to avoid typos in job type strings
 * Makes refactoring easier
 */
const JOB_TYPES = {
  // Notification jobs
  NOTIFICATION_LIKE: 'notification:like',
  NOTIFICATION_COMMENT: 'notification:comment',
  NOTIFICATION_FOLLOW: 'notification:follow',
  NOTIFICATION_MENTION: 'notification:mention',
  
  // Email jobs
  EMAIL_WELCOME: 'email:welcome',
  EMAIL_PASSWORD_RESET: 'email:password-reset',
  EMAIL_NOTIFICATION_DIGEST: 'email:notification-digest',
  
  // Analytics jobs
  ANALYTICS_POST_VIEW: 'analytics:post-view',
  ANALYTICS_USER_ACTION: 'analytics:user-action'
};

// ===========================================
// QUEUE SERVICE CLASS
// ===========================================
class QueueService {
  /**
   * Add job to notification queue
   * 
   * LEARNING: Job Options
   * 
   * BullMQ job options:
   * 
   * - delay: Wait before processing (ms)
   *   Use for: Scheduled tasks, delayed notifications
   * 
   * - attempts: Number of retry attempts
   *   Use for: Unreliable external services
   * 
   * - backoff: Retry delay strategy
   *   - 'fixed': Same delay each time
   *   - 'exponential': 1s, 2s, 4s, 8s... (recommended)
   * 
   * - priority: Job priority (lower = higher priority)
   *   Use for: VIP users, urgent notifications
   * 
   * - removeOnComplete: Remove job data after completion
   *   true or number (keep last N completed)
   * 
   * - removeOnFail: Remove job data after failure
   *   Usually false (for debugging)
   */
  static async addNotificationJob(type, data, options = {}) {
    const defaultOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000 // Start with 1 second
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 1000     // Keep failed for debugging
    };
    
    const job = await notificationQueue.add(type, data, {
      ...defaultOptions,
      ...options
    });
    
    console.log(`📬 JOB ADDED: ${type} (ID: ${job.id})`);
    return job;
  }
  
  /**
   * Add notification for like
   * 
   * Called when user likes a post
   * Worker will:
   * 1. Create notification in database
   * 2. Publish real-time event
   */
  static async notifyLike(data) {
    const { postId, postAuthorId, likerId, likerName } = data;
    
    // Don't notify if user likes own post
    if (postAuthorId === likerId) {
      return null;
    }
    
    return await this.addNotificationJob(JOB_TYPES.NOTIFICATION_LIKE, {
      recipientId: postAuthorId,
      senderId: likerId,
      senderName: likerName,
      postId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add notification for comment
   */
  static async notifyComment(data) {
    const { postId, postAuthorId, commenterId, commenterName, commentPreview } = data;
    
    if (postAuthorId === commenterId) {
      return null;
    }
    
    return await this.addNotificationJob(JOB_TYPES.NOTIFICATION_COMMENT, {
      recipientId: postAuthorId,
      senderId: commenterId,
      senderName: commenterName,
      postId,
      commentPreview,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add notification for follow
   */
  static async notifyFollow(data) {
    const { followedId, followerId, followerName } = data;
    
    return await this.addNotificationJob(JOB_TYPES.NOTIFICATION_FOLLOW, {
      recipientId: followedId,
      senderId: followerId,
      senderName: followerName,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add email job
   * 
   * LEARNING: Delayed Jobs
   * 
   * Some emails shouldn't be sent immediately:
   * - Digest emails: Wait and batch notifications
   * - Reminder emails: Send after X hours of inactivity
   */
  static async addEmailJob(type, data, options = {}) {
    const defaultOptions = {
      attempts: 5, // More retries for emails (important!)
      backoff: {
        type: 'exponential',
        delay: 5000 // 5 seconds initial delay
      },
      removeOnComplete: 50
    };
    
    return await emailQueue.add(type, data, {
      ...defaultOptions,
      ...options
    });
  }
  
  /**
   * Send welcome email
   */
  static async sendWelcomeEmail(userId, email, username) {
    return await this.addEmailJob(JOB_TYPES.EMAIL_WELCOME, {
      userId,
      email,
      username,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add analytics event
   * 
   * LEARNING: Fire-and-Forget Jobs
   * 
   * Analytics can:
   * - Have lower priority
   * - Have fewer retries
   * - Be removed quickly (data stored elsewhere)
   */
  static async trackAnalytics(type, data) {
    return await analyticsQueue.add(type, {
      ...data,
      timestamp: Date.now()
    }, {
      attempts: 1,         // Don't retry analytics
      removeOnComplete: 10,
      priority: 10         // Lower priority (higher number)
    });
  }
  
  /**
   * Scheduled/Delayed job
   * 
   * LEARNING: Delay Feature
   * 
   * delay: 60000 (60 seconds)
   * Job won't be processed until 60 seconds pass
   * 
   * USE CASES:
   * - "Undo" feature: Delay email 5 seconds, cancel if user undoes
   * - Reminders: "You haven't posted in 3 days"
   * - Rate limiting: Batch notifications into digest
   */
  static async scheduleNotificationDigest(userId, email, delay = 3600000) {
    return await emailQueue.add(
      JOB_TYPES.EMAIL_NOTIFICATION_DIGEST,
      { userId, email },
      {
        delay, // Default: 1 hour
        attempts: 3,
        jobId: `digest:${userId}` // Unique per user - prevents duplicates
      }
    );
  }
  
  /**
   * Get queue stats
   * 
   * LEARNING: Queue Monitoring
   * 
   * Important metrics:
   * - waiting: Jobs queued, not yet processing
   * - active: Jobs currently being processed
   * - completed: Successfully finished jobs
   * - failed: Jobs that errored out
   * - delayed: Jobs waiting for their delay to pass
   * 
   * HIGH WAITING COUNT = Workers can't keep up!
   * HIGH FAILED COUNT = Something is broken!
   */
  static async getQueueStats(queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);
    
    return { waiting, active, completed, failed, delayed };
  }
  
  /**
   * Get all queues stats
   */
  static async getAllStats() {
    const [notifications, emails, analytics] = await Promise.all([
      this.getQueueStats(notificationQueue),
      this.getQueueStats(emailQueue),
      this.getQueueStats(analyticsQueue)
    ]);
    
    return { notifications, emails, analytics };
  }
}

// ===========================================
// QUEUE EVENTS (For monitoring)
// ===========================================
/**
 * LEARNING: Queue Events
 * 
 * BullMQ emits events you can listen to:
 * - completed: Job finished successfully
 * - failed: Job errored
 * - progress: Job progress update
 * - stalled: Job stalled (worker died?)
 * 
 * Use for:
 * - Logging
 * - Metrics
 * - Alerting
 */
const notificationQueueEvents = new QueueEvents('notifications', { connection });

notificationQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`✅ Job ${jobId} completed with result:`, returnvalue);
});

notificationQueueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed with reason:`, failedReason);
});

// Export queues and service
module.exports = {
  // Queues (for workers)
  notificationQueue,
  emailQueue,
  analyticsQueue,
  
  // Types
  JOB_TYPES,
  
  // Service
  QueueService,
  
  // Connection config (for workers in separate process)
  connection
};
