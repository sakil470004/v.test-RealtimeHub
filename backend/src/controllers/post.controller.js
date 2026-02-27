/**
 * ===========================================
 * POST CONTROLLER
 * ===========================================
 * 
 * Demonstrates:
 * - CRUD operations
 * - Redis caching with Cache-Aside pattern
 * - Cache invalidation
 * - Pagination
 */

const Post = require('../models/Post.model');
const Like = require('../models/Like.model');
const { CacheService } = require('../services/cache.service');

/**
 * CREATE POST
 * POST /api/v1/posts
 * 
 * LEARNING: Create with Cache Invalidation
 * 
 * When creating new data:
 * 1. Save to database
 * 2. Invalidate related caches
 * 
 * Don't cache the new post immediately because:
 * - Might never be viewed
 * - Lazy loading is often better
 */
const createPost = async (req, res, next) => {
  try {
    const { content, media, tags, visibility } = req.body;
    
    // Create post
    const post = await Post.create({
      author: req.user._id,
      content,
      media: media || [],
      tags: tags || [],
      visibility: visibility || 'public'
    });
    
    // Populate author for response
    await post.populate('author', 'username displayName avatar');
    
    /**
     * LEARNING: Cache Invalidation After Create
     * 
     * New post means:
     * - Global feed cache is outdated
     * - User's personal feed cache is outdated
     * 
     * We invalidate (delete) these caches
     * Next request will regenerate fresh cache
     */
    await Promise.all([
      CacheService.invalidateGlobalFeed(),
      CacheService.invalidateUserFeed(req.user._id)
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Post created',
      data: { post }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET FEED (Paginated)
 * GET /api/v1/posts/feed
 * 
 * LEARNING: Cache-Aside Pattern in Action!
 * 
 * This is the main caching learning example:
 * 
 * 1. Check cache first (fast!)
 * 2. If HIT → return cached data
 * 3. If MISS → query database
 * 4. Store result in cache
 * 5. Return data
 * 
 * With "liked" status for logged-in users
 */
const getFeed = async (req, res, next) => {
  try {
    const { cursor, limit = 10 } = req.query;
    const userId = req.user?._id?.toString();
    
    /**
     * STEP 1: CHECK CACHE
     * 
     * Key includes cursor for pagination
     * Different page = different cache entry
     */
    const cacheKey = userId 
      ? `feed:user:${userId}:cursor:${cursor || 'initial'}`
      : `feed:global:cursor:${cursor || 'initial'}`;
    
    let feedData = await CacheService.get(cacheKey);
    
    /**
     * STEP 2: CACHE HIT - Return cached data
     */
    if (feedData) {
      console.log('🟢 Serving feed from cache');
      
      // Still need to check liked status (might have changed)
      if (userId && feedData.posts.length > 0) {
        feedData = await addLikedStatus(feedData, userId);
      }
      
      return res.status(200).json({
        success: true,
        data: feedData,
        cached: true
      });
    }
    
    /**
     * STEP 3: CACHE MISS - Query database
     */
    console.log('🔴 Cache miss - querying database');
    
    const result = await Post.getFeed({
      cursor,
      limit: parseInt(limit)
    });
    
    /**
     * STEP 4: STORE IN CACHE
     * 
     * Store for 60 seconds (feed changes often)
     */
    await CacheService.set(cacheKey, result, 60);
    
    /**
     * STEP 5: Add user-specific data (liked status)
     */
    if (userId && result.posts.length > 0) {
      result.posts = await addLikedStatusToPostsList(result.posts, userId);
    }
    
    res.status(200).json({
      success: true,
      data: result,
      cached: false
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET SINGLE POST
 * GET /api/v1/posts/:id
 * 
 * LEARNING: Individual Resource Caching
 */
const getPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id?.toString();
    
    // Check cache
    let post = await CacheService.getPost(id);
    
    if (!post) {
      // Cache miss - query database
      post = await Post.findById(id)
        .populate('author', 'username displayName avatar');
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }
      
      // Store in cache (longer TTL for individual posts)
      await CacheService.setPost(id, post.toObject());
    }
    
    // Add liked status for logged-in user
    if (userId) {
      const liked = await Like.hasUserLiked(userId, id);
      post = { ...post, isLikedByMe: liked };
    }
    
    res.status(200).json({
      success: true,
      data: { post }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET USER'S POSTS
 * GET /api/v1/posts/user/:userId
 */
const getUserPosts = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { cursor, limit = 10 } = req.query;
    
    const result = await Post.getByUser(userId, {
      cursor,
      limit: parseInt(limit)
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
 * UPDATE POST
 * PUT /api/v1/posts/:id
 * 
 * LEARNING: Update with Cache Invalidation
 */
const updatePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, tags, visibility } = req.body;
    
    const post = await Post.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    
    // Check ownership
    /**
     * LEARNING: Authorization Check
     * 
     * Even if user is authenticated, check if they
     * own the resource they're trying to modify
     */
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this post'
      });
    }
    
    // Update fields
    if (content !== undefined) post.content = content;
    if (tags !== undefined) post.tags = tags;
    if (visibility !== undefined) post.visibility = visibility;
    
    await post.save();
    await post.populate('author', 'username displayName avatar');
    
    /**
     * LEARNING: Invalidate Affected Caches
     * 
     * Post content changed, so invalidate:
     * - The specific post cache
     * - Feeds that might contain this post
     */
    await Promise.all([
      CacheService.invalidatePost(id),
      CacheService.invalidateGlobalFeed(),
      CacheService.invalidateUserFeed(req.user._id)
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Post updated',
      data: { post }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE POST
 * DELETE /api/v1/posts/:id
 * 
 * LEARNING: Soft Delete with Cache Invalidation
 */
const deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const post = await Post.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    
    // Check ownership
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post'
      });
    }
    
    // Soft delete
    await post.softDelete();
    
    // Invalidate caches
    await Promise.all([
      CacheService.invalidatePost(id),
      CacheService.invalidateGlobalFeed(),
      CacheService.invalidateUserFeed(req.user._id),
      CacheService.invalidatePostComments(id)
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Post deleted'
    });
    
  } catch (error) {
    next(error);
  }
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Add liked status to posts list
 * 
 * LEARNING: Batch Operations
 * 
 * Instead of N queries (1 per post), do 1 batch query
 * Much more efficient!
 */
async function addLikedStatusToPostsList(posts, userId) {
  const postIds = posts.map(p => p._id || p.id);
  const likedPostIds = await Like.getLikedPostIds(userId, postIds);
  
  return posts.map(post => {
    const postObj = post.toObject ? post.toObject() : post;
    return {
      ...postObj,
      isLikedByMe: likedPostIds.has(postObj._id.toString())
    };
  });
}

/**
 * Add liked status to cached feed data
 */
async function addLikedStatus(feedData, userId) {
  const posts = await addLikedStatusToPostsList(feedData.posts, userId);
  return { ...feedData, posts };
}

module.exports = {
  createPost,
  getFeed,
  getPost,
  getUserPosts,
  updatePost,
  deletePost
};
