/**
 * CREATE POST COMPONENT
 * 
 * Form for creating new posts
 */

import { useState } from 'react';
import { postsAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function CreatePost({ onPostCreated }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!content.trim()) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      const response = await postsAPI.create({ content: content.trim() });
      
      // Clear the form
      setContent('');
      
      // Notify parent component
      if (onPostCreated) {
        onPostCreated({
          ...response.data.data.post,
          author: {
            _id: user.id,
            username: user.username,
            avatar: user.avatar
          },
          likesCount: 0,
          commentsCount: 0
        });
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };
  
  if (!user) return null;
  
  return (
    <div className="create-post card">
      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={submitting}
        />
        
        {error && <p className="error-message">{error}</p>}
        
        <div className="create-post-footer">
          <span className="char-count">{content.length}/500</span>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!content.trim() || submitting}
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
