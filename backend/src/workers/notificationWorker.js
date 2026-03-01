/**
 * ===========================================
 * NOTIFICATION WORKER
 * ===========================================
 * 
 * CORE REDIS LEARNING MODULE
 * 
 * ===========================================
 * WHAT IS A WORKER?
 * ===========================================
 * 
 * Worker = Separate process that processes queue jobs
 * 
 * WHY SEPARATE PROCESS?
 * - API server stays fast (not blocked by job processing)
 * - Can scale independently (add more workers)
 * - If worker crashes, API keeps running
 * - Different resource requirements
 * 
 * ===========================================
 * HOW WORKERS PROCESS JOBS
 * ===========================================
 * 
 * 1. Worker polls queue for jobs
 * 2. Takes a job and "locks" it
 * 3. Processes the job
 * 4. Reports success or failure
 * 5. Repeats
 * 
 * LOCKING (Important!):
 * - Prevents two workers from processing same job
 * - BullMQ handles this with Redis BRPOPLPUSH
 * - Job moves from "waiting" to "active" atomically
 * 
 * ===========================================
 * RUNNING THIS WORKER
 * ===========================================
 * 
 * Run in a separate terminal:
 * npm run worker
 * 
 * Or: node src/workers/notificationWorker.js
 * 
 * In production:
 * - Use PM2 for process management
 * - Run multiple instances for scaling
 */

require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');

// Import services
const { connection, JOB_TYPES } = require('../services/queue.service');
const { PubSubService } = require('../services/pubsub.service');
const { CacheService } = require('../services/cache.service');
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');

// ===========================================
// WORKER CONFIGURATION
// ===========================================
/**
 * LEARNING: Worker Options
 * 
 * concurrency: How many jobs to process simultaneously
 * - Higher = Faster throughput
 * - But: More memory, more DB connections
 * - Start with 5-10, tune based on resources
 * 
 * lockDuration: How long worker "owns" a job
 * - If processing takes longer, lock may expire
 * - Another worker could pick it up = DUPLICATE!
 * - Set based on expected processing time
 * 
 * limiter: Rate limit job processing
 * - Protect external services from overload
 * - Example: Max 10 emails per second
 */
const workerOptions = {
  connection,
  concurrency: 5,
  lockDuration: 30000, // 30 seconds
};

// ===========================================
// JOB PROCESSORS
// ===========================================
/**
 * LEARNING: Job Processing Pattern
 * 
 * Each job type has its own processor function
 * Processor receives:
 * - job: The job object with data
 * 
 * Must either:
 * - Return a value (job completes)
 * - Throw an error (job fails, may retry)
 */

/**
 * Process LIKE notification
 */
async function processLikeNotification(job) {
  const { recipientId, senderId, senderName, postId } = job.data;
  
  console.log(`📝 Processing like notification for post ${postId}`);
  
  // 1. Get sender info for notification
  const sender = await User.findById(senderId).select('username displayName avatar');
  if (!sender) {
    throw new Error(`Sender not found: ${senderId}`);
  }
  
  // 2. Create notification in database
  const notification = await Notification.createNotification({
    type: 'like',
    recipient: recipientId,
    sender: sender,
    post: postId,
    metadata: { action: 'liked your post' }
  });
  
  if (!notification) {
    // Notification was duplicate or user liked own post
    return { skipped: true, reason: 'duplicate or self-action' };
  }
  
  // 3. Invalidate notification count cache
  await CacheService.invalidateNotificationCount(recipientId);
  
  // 4. Publish real-time event
  await PubSubService.publishNotification(recipientId, {
    type: 'like',
    notification: notification.toObject(),
    timestamp: Date.now()
  });
  
  console.log(`✅ Like notification sent to user ${recipientId}`);
  
  return {
    success: true,
    notificationId: notification._id
  };
}

/**
 * Process COMMENT notification
 */
async function processCommentNotification(job) {
  const { recipientId, senderId, senderName, postId, commentPreview } = job.data;
  
  console.log(`📝 Processing comment notification for post ${postId}`);
  
  const sender = await User.findById(senderId).select('username displayName avatar');
  if (!sender) {
    throw new Error(`Sender not found: ${senderId}`);
  }
  
  const notification = await Notification.createNotification({
    type: 'comment',
    recipient: recipientId,
    sender: sender,
    post: postId,
    metadata: { 
      action: 'commented on your post',
      preview: commentPreview?.substring(0, 100) 
    }
  });
  
  if (!notification) {
    return { skipped: true, reason: 'duplicate or self-action' };
  }
  
  await CacheService.invalidateNotificationCount(recipientId);
  
  await PubSubService.publishNotification(recipientId, {
    type: 'comment',
    notification: notification.toObject(),
    timestamp: Date.now()
  });
  
  console.log(`✅ Comment notification sent to user ${recipientId}`);
  
  return {
    success: true,
    notificationId: notification._id
  };
}

/**
 * Process FOLLOW notification
 */
async function processFollowNotification(job) {
  const { recipientId, senderId, senderName } = job.data;
  
  console.log(`📝 Processing follow notification from ${senderName}`);
  
  const sender = await User.findById(senderId).select('username displayName avatar');
  if (!sender) {
    throw new Error(`Sender not found: ${senderId}`);
  }
  
  const notification = await Notification.createNotification({
    type: 'follow',
    recipient: recipientId,
    sender: sender,
    metadata: { action: 'started following you' }
  });
  
  if (!notification) {
    return { skipped: true, reason: 'duplicate' };
  }
  
  await CacheService.invalidateNotificationCount(recipientId);
  
  await PubSubService.publishNotification(recipientId, {
    type: 'follow',
    notification: notification.toObject(),
    timestamp: Date.now()
  });
  
  console.log(`✅ Follow notification sent to user ${recipientId}`);
  
  return {
    success: true,
    notificationId: notification._id
  };
}

// ===========================================
// CREATE WORKER
// ===========================================
/**
 * LEARNING: Worker Creation
 * 
 * Worker(queueName, processor, options)
 * 
 * The processor function:
 * - Receives job object
 * - Must return a value or throw
 * - Can be async
 */
const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    console.log(`\n🔧 Processing job: ${job.name} (ID: ${job.id})`);
    console.log(`   Data:`, JSON.stringify(job.data, null, 2));
    
    /**
     * LEARNING: Job Routing
     * 
     * Route job to correct processor based on job.name
     * job.name = the type passed when adding job
     */
    switch (job.name) {
      case JOB_TYPES.NOTIFICATION_LIKE:
        return await processLikeNotification(job);
        
      case JOB_TYPES.NOTIFICATION_COMMENT:
        return await processCommentNotification(job);
        
      case JOB_TYPES.NOTIFICATION_FOLLOW:
        return await processFollowNotification(job);
        
      default:
        console.warn(`Unknown job type: ${job.name}`);
        return { skipped: true, reason: 'unknown job type' };
    }
  },
  workerOptions
);

// ===========================================
// WORKER EVENTS
// ===========================================
/**
 * LEARNING: Worker Event Handling
 * 
 * Workers emit events for monitoring:
 * - completed: Job processed successfully
 * - failed: Job errored
 * - error: Worker-level error
 * - stalled: Job stalled (took too long?)
 */

notificationWorker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

notificationWorker.on('failed', (job, error) => {
  /**
   * LEARNING: Failed Job Handling
   * 
   * When a job fails:
   * 1. BullMQ checks retry configuration
   * 2. If attempts remaining, reschedules with backoff
   * 3. If no attempts left, moves to failed queue
   * 
   * The 'failed' event fires when ALL retries exhausted
   */
  console.error(`❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`, error);
  
  // Could send alert to monitoring system here
  // sendAlert(`Job ${job.id} failed: ${error.message}`);
});

notificationWorker.on('error', (error) => {
  console.error('Worker error:', error);
});

/**
 * LEARNING: Stalled Jobs
 * 
 * A job is "stalled" when:
 * - Worker took the job
 * - Worker didn't complete or fail it
 * - Lock expired
 * 
 * Could mean:
 * - Worker crashed
 * - Job is taking too long
 * - Network issues
 * 
 * BullMQ will retry stalled jobs
 */
notificationWorker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} stalled`);
});

// ===========================================
// STARTUP
// ===========================================
/**
 * LEARNING: Worker Startup Sequence
 * 
 * 1. Connect to MongoDB (for creating notifications)
 * 2. Worker automatically connects to Redis
 * 3. Begin processing jobs
 * 
 * Worker runs independently of API server
 */
async function startWorker() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
    
    // Initialize Redis services (CacheService uses global Redis connection)
    const { connectRedis } = require('../config/redis');
    await connectRedis();
    console.log('✅ Redis connected');
    
    // Initialize PubSub service for real-time notifications
    await PubSubService.initialize();
    console.log('✅ PubSub initialized');
    
    console.log('🚀 Notification worker started');
    console.log(`   Concurrency: ${workerOptions.concurrency}`);
    console.log(`   Listening for jobs...`);
    
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================
/**
 * LEARNING: Graceful Worker Shutdown
 * 
 * When stopping worker:
 * 1. Stop accepting new jobs
 * 2. Wait for current jobs to complete
 * 3. Close connections
 * 
 * If you don't do this, jobs may be lost or stuck!
 */
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Close worker (stop accepting jobs)
  await notificationWorker.close();
  console.log('Worker closed');
  
  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
  
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the worker
startWorker();

module.exports = notificationWorker;
