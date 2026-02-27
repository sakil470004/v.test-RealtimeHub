/**
 * COMMENT SECTION COMPONENT
 * 
 * Shows comments for a post and allows adding new ones.
 * 
 * LEARNING: Cursor-based Pagination
 * Comments use cursor pagination for efficiency
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { commentsAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function CommentSection({ postId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  
  /**
   * Fetch comments with cursor pagination
   */
  const fetchComments = async (cursorValue = null) => {
    try {
      const response = await commentsAPI.getByPost(postId, { cursor: cursorValue, limit: 5 });
      const data = response.data.data;
      
      if (cursorValue) {
        // Append to existing comments
        setComments(prev => [...prev, ...data.comments]);
      } else {
        // First load
        setComments(data.comments);
      }
      
      setCursor(data.pagination.nextCursor);
      setHasMore(data.pagination.hasMore);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchComments();
  }, [postId]);
  
  /**
   * Submit new comment
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim() || submitting) return;
    
    setSubmitting(true);
    
    try {
      const response = await commentsAPI.create(postId, { content: newComment.trim() });
      
      // Add new comment to the top
      const newCommentData = {
        ...response.data.data.comment,
        author: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar
        }
      };
      
      setComments(prev => [newCommentData, ...prev]);
      setNewComment('');
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setSubmitting(false);
    }
  };
  
  /**
   * Delete comment
   */
  const handleDelete = async (commentId) => {
    try {
      await commentsAPI.delete(commentId);
      setComments(prev => prev.filter(c => c._id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };
  
  /**
   * Format relative time
   */
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'now';
  };
  
  if (loading) {
    return <div className="comments-loading">Loading comments...</div>;
  }
  
  return (
    <div className="comments-section">
      {/* Comment Form */}
      {user && (
        <form onSubmit={handleSubmit} className="comment-form">
          <input
            type="text"
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="comment-input"
            disabled={submitting}
          />
          <button 
            type="submit" 
            className="btn btn-primary btn-sm"
            disabled={!newComment.trim() || submitting}
          >
            {submitting ? '...' : 'Post'}
          </button>
        </form>
      )}
      
      {/* Comments List */}
      <div className="comments-list">
        {comments.length === 0 ? (
          <p className="no-comments">No comments yet. Be the first!</p>
        ) : (
          comments.map(comment => (
            <div key={comment._id} className="comment">
              <div className="comment-header">
                <Link to={`/profile/${comment.author._id}`} className="comment-author">
                  <span className="author-name">{comment.author.username}</span>
                </Link>
                <span className="comment-time">{formatTime(comment.createdAt)}</span>
                
                {/* Delete button for comment owner */}
                {user && user._id === comment.author._id && (
                  <button 
                    className="comment-delete"
                    onClick={() => handleDelete(comment._id)}
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="comment-content">{comment.content}</p>
            </div>
          ))
        )}
      </div>
      
      {/* Load More */}
      {hasMore && (
        <button 
          className="load-more-btn"
          onClick={() => fetchComments(cursor)}
        >
          Load more comments
        </button>
      )}
    </div>
  );
}
