/**
 * FEED PAGE
 * 
 * Main page showing posts from all users
 * 
 * LEARNING: Infinite Scroll with Cursor Pagination
 * 
 * Why cursor pagination over offset?
 * - More efficient for large datasets
 * - No duplicate posts when new content is added
 * - Better performance with proper indexing
 */

import { useState, useEffect, useCallback } from 'react';
import { postsAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import CreatePost from '../components/CreatePost.jsx';

export default function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  
  /**
   * Fetch posts with cursor pagination
   */
  const fetchPosts = useCallback(async (cursorValue = null) => {
    try {
      const response = await postsAPI.getFeed({ cursor: cursorValue, limit: 10 });
      const data = response.data.data;
      
      if (cursorValue) {
        // Append to existing posts (loading more)
        setPosts(prev => [...prev, ...data.posts]);
      } else {
        // Initial load or refresh
        setPosts(data.posts);
      }
      
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError('Failed to load posts');
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  
  /**
   * Initial load
   */
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);
  
  /**
   * Handle new post created
   */
  const handlePostCreated = (newPost) => {
    setPosts(prev => [newPost, ...prev]);
  };
  
  /**
   * Load more posts
   */
  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPosts(cursor);
  };
  
  /**
   * LEARNING: Intersection Observer for Infinite Scroll
   * 
   * Better than scroll events:
   * - More performant (no scroll event spam)
   * - Handles visibility changes
   * - Works with CSS containers
   * 
   * Note: For simplicity, we use a "Load More" button here
   * but you could implement Intersection Observer
   */
  
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading posts...</p>
      </div>
    );
  }
  
  return (
    <div className="feed-page">
      <div className="feed-container">
        {/* Create Post */}
        {user && (
          <CreatePost onPostCreated={handlePostCreated} />
        )}
        
        {/* Error Message */}
        {error && (
          <div className="error-message">{error}</div>
        )}
        
        {/* Posts List */}
        <div className="posts-list">
          {posts.length === 0 ? (
            <div className="empty-state card">
              <h3>No posts yet</h3>
              <p>Be the first to share something!</p>
            </div>
          ) : (
            posts.map(post => (
              <PostCard 
                key={post.id} 
                post={post}
              />
            ))
          )}
        </div>
        
        {/* Load More */}
        {hasMore && posts.length > 0 && (
          <div className="load-more-container">
            <button 
              className="btn btn-secondary"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : 'Load More Posts'}
            </button>
          </div>
        )}
        
        {/* End of Feed */}
        {!hasMore && posts.length > 0 && (
          <div className="end-of-feed">
            <p>You've reached the end! 🎉</p>
          </div>
        )}
      </div>
    </div>
  );
}
