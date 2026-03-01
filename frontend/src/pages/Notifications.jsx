/**
 * NOTIFICATIONS PAGE
 * 
 * Shows list of user notifications
 * 
 * LEARNING: Real-time Updates
 * 
 * New notifications come through WebSocket (Socket.IO)
 * The NotificationContext handles the socket connection
 * and updates the unread count in real-time
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { notificationsAPI } from '../services/api.js';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function Notifications() {
  const { markAllAsRead, refreshCount } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  /**
   * Fetch notifications
   */
  const fetchNotifications = async (cursorValue = null) => {
    try {
      const response = await notificationsAPI.getAll({ cursor: cursorValue, limit: 20 });
      const data = response.data.data;
      
      if (cursorValue) {
        setNotifications(prev => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications);
      }
      
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  
  useEffect(() => {
    fetchNotifications();
  }, []);
  
  /**
   * Mark all as read when visiting page
   */
  useEffect(() => {
    // Mark all as read after a short delay
    const timer = setTimeout(() => {
      if (notifications.some(n => !n.isRead)) {
        handleMarkAllRead();
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [notifications]);
  
  /**
   * Handle mark all as read
   */
  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => 
        prev.map(n => ({ ...n, isRead: true }))
      );
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };
  
  /**
   * Load more notifications
   */
  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchNotifications(cursor);
  };
  
  /**
   * Get notification icon based on type
   */
  const getIcon = (type) => {
    switch (type) {
      case 'like':
        return '❤️';
      case 'comment':
        return '💬';
      case 'follow':
        return '👤';
      default:
        return '🔔';
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
  
  /**
   * Get notification link
   */
  const getLink = (notification) => {
    if (notification.post) {
      return `/post/${notification.post}`;
    }
    if (notification.sender) {
      return `/profile/${notification.sender._id}`;
    }
    return '#';
  };
  
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading notifications...</p>
      </div>
    );
  }
  
  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>Notifications</h1>
        {notifications.some(n => !n.isRead) && (
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleMarkAllRead}
          >
            Mark all as read
          </button>
        )}
      </div>
      
      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="empty-state card">
            <h3>No notifications yet</h3>
            <p>When someone likes or comments on your posts, you'll see it here.</p>
          </div>
        ) : (
          notifications.map(notification => (
            <Link 
              key={notification._id}
              to={getLink(notification)}
              className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
            >
              <span className="notification-icon">
                {getIcon(notification.type)}
              </span>
              
              <div className="notification-content">
                <p className="notification-message">{notification.message}</p>
                <span className="notification-time">{formatTime(notification.createdAt)}</span>
              </div>
              
              {!notification.isRead && (
                <span className="unread-dot"></span>
              )}
            </Link>
          ))
        )}
      </div>
      
      {/* Load More */}
      {hasMore && notifications.length > 0 && (
        <div className="load-more-container">
          <button 
            className="btn btn-secondary"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
