/**
 * ===========================================
 * MODELS INDEX FILE
 * ===========================================
 * 
 * LEARNING: Barrel Exports
 * 
 * Instead of importing each model separately:
 * const User = require('./models/User.model');
 * const Post = require('./models/Post.model');
 * 
 * We can import from one place:
 * const { User, Post, Comment } = require('./models');
 * 
 * Benefits:
 * - Cleaner imports
 * - Single point of change
 * - Easy to see all models
 */

const User = require('./User.model');
const Post = require('./Post.model');
const Comment = require('./Comment.model');
const Like = require('./Like.model');
const Notification = require('./Notification.model');

module.exports = {
  User,
  Post,
  Comment,
  Like,
  Notification
};
