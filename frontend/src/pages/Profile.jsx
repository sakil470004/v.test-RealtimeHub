/**
 * PROFILE PAGE
 * 
 * Shows user profile and their posts
 * 
 * LEARNING: Dynamic Route Parameters
 * 
 * React Router's useParams hook gives us access to URL parameters
 * /profile/:userId -> useParams().userId
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { usersAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Profile() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  
  const isOwnProfile = currentUser?.id === userId;
  
  /**
   * Fetch user profile
   */
  const fetchProfile = useCallback(async () => {
    try {
      const response = await usersAPI.getProfile(userId);
      setProfile(response.data.data.user);
    } catch (err) {
      setError('User not found');
      console.error(err);
    }
  }, [userId]);
  
  /**
   * Fetch user's posts
   */
  const fetchPosts = useCallback(async (cursorValue = null) => {
    try {
      const response = await usersAPI.getUserPosts(userId, { cursor: cursorValue, limit: 10 });
      const data = response.data.data;
      
      if (cursorValue) {
        setPosts(prev => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  }, [userId]);
  
  /**
   * Load profile and posts
   */
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');
      setPosts([]);
      setCursor(null);
      setHasMore(true);
      
      await fetchProfile();
      await fetchPosts();
      
      setLoading(false);
    };
    
    loadData();
  }, [userId, fetchProfile, fetchPosts]);
  
  /**
   * Load more posts
   */
  const loadMore = async () => {
    if (loadingPosts || !hasMore) return;
    setLoadingPosts(true);
    await fetchPosts(cursor);
    setLoadingPosts(false);
  };
  
  /**
   * Format join date
   */
  const formatJoinDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  };
  
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="error-container">
        <h2>{error}</h2>
      </div>
    );
  }
  
  return (
    <div className="profile-page">
      {/* Profile Header */}
      <div className="profile-header card">
        <div className="profile-avatar">
          {profile.avatar ? (
            <img src={profile.avatar} alt={profile.username} />
          ) : (
            <div className="avatar-placeholder large">
              {profile.username?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        
        <div className="profile-info">
          <h1>{profile.username}</h1>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <p className="profile-joined">Joined {formatJoinDate(profile.createdAt)}</p>
        </div>
        
        {isOwnProfile && (
          <button className="btn btn-secondary">
            Edit Profile
          </button>
        )}
      </div>
      
      {/* Profile Stats */}
      <div className="profile-stats card">
        <div className="stat">
          <span className="stat-value">{profile.postsCount || posts.length}</span>
          <span className="stat-label">Posts</span>
        </div>
      </div>
      
      {/* User's Posts */}
      <div className="profile-posts">
        <h2>Posts</h2>
        
        {posts.length === 0 ? (
          <div className="empty-state card">
            <p>{isOwnProfile ? "You haven't posted anything yet." : "No posts yet."}</p>
          </div>
        ) : (
          <div className="posts-list">
            {posts.map(post => (
              <PostCard key={post._id} post={post} />
            ))}
          </div>
        )}
        
        {/* Load More */}
        {hasMore && posts.length > 0 && (
          <div className="load-more-container">
            <button 
              className="btn btn-secondary"
              onClick={loadMore}
              disabled={loadingPosts}
            >
              {loadingPosts ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
