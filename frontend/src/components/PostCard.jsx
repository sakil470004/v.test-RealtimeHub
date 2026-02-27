/**
 * POST CARD COMPONENT
 * 
 * Displays a single post with:
 * - Author info
 * - Post content
 * - Like/comment counts
 * - Like button
 * - Comments section toggle
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { likesAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import CommentSection from './CommentSection.jsx';

export default function PostCard({ post, onUpdate }) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [isLiked, setIsLiked] = useState(post.isLikedByCurrentUser || false);
  const [likeCount, setLikeCount] = useState(post.likesCount || 0);
  const [isLiking, setIsLiking] = useState(false);
  
  /**
   * Handle like/unlike
   * 
   * Uses optimistic update for better UX:
   * 1. Update UI immediately
   * 2. Send request to server
   * 3. Revert if request fails
   */
  const handleLike = async () => {
    if (!user || isLiking) return;
    
    setIsLiking(true);
    
    // Optimistic update
    const previousIsLiked = isLiked;
    const previousCount = likeCount;
    setIsLiked(!isLiked);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    
    try {
      await likesAPI.toggle(post._id);
    } catch (error) {
      // Revert on error
      setIsLiked(previousIsLiked);
      setLikeCount(previousCount);
      console.error('Failed to toggle like:', error);
    } finally {
      setIsLiking(false);
    }
  };
  
  /**
   * Format date to relative time
   */
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  };
  
  return (
    <div className="post-card">
      {/* Post Header */}
      <div className="post-header">
        <Link to={`/profile/${post.author._id}`} className="post-author">
          <div className="avatar">
            {post.author.avatar ? (
              <img src={post.author.avatar} alt={post.author.username} />
            ) : (
              <div className="avatar-placeholder">
                {post.author.username?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="author-info">
            <span className="author-name">{post.author.username}</span>
            <span className="post-time">{formatDate(post.createdAt)}</span>
          </div>
        </Link>
      </div>
      
      {/* Post Content */}
      <div className="post-content">
        <p>{post.content}</p>
      </div>
      
      {/* Post Stats */}
      <div className="post-stats">
        <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
        <span>{post.commentsCount || 0} {post.commentsCount === 1 ? 'comment' : 'comments'}</span>
      </div>
      
      {/* Post Actions */}
      <div className="post-actions">
        <button 
          className={`action-btn ${isLiked ? 'liked' : ''}`}
          onClick={handleLike}
          disabled={!user || isLiking}
        >
          {isLiked ? '❤️' : '🤍'} Like
        </button>
        
        <button 
          className="action-btn"
          onClick={() => setShowComments(!showComments)}
        >
          💬 Comment
        </button>
      </div>
      
      {/* Comments Section */}
      {showComments && (
        <CommentSection postId={post._id} />
      )}
    </div>
  );
}
