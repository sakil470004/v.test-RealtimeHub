/**
 * ===========================================
 * NOTIFICATION CONTEXT
 * ===========================================
 * 
 * LEARNING: Real-time Notifications with WebSocket
 * 
 * This context:
 * 1. Maintains unread notification count
 * 2. Connects to WebSocket for real-time updates
 * 3. Shows toast notifications when new ones arrive
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { notificationsAPI } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';
import toast from 'react-hot-toast';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);
  
  /**
   * Fetch initial unread count
   */
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await notificationsAPI.getUnreadCount();
      setUnreadCount(response.data.data.count);
    } catch (error) {
      console.error('Failed to fetch notification count:', error);
    }
  }, [user]);
  
  /**
   * LEARNING: WebSocket Connection for Real-time
   * 
   * Socket.IO enables real-time bidirectional communication
   * 
   * Flow:
   * 1. Server publishes to Redis Pub/Sub
   * 2. Server's socket handler receives it
   * 3. Server emits to connected client
   * 4. Client receives and updates UI
   */
  useEffect(() => {
    if (!user) {
      // Disconnect if user logs out
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }
    
    // Connect to Socket.IO
    const token = localStorage.getItem('token');
    const newSocket = io({
      auth: {
        token
      }
    });
    
    /**
     * LEARNING: Socket Events
     * 
     * 'connect': Connected to server
     * 'disconnect': Disconnected from server
     * 'notification': Custom event for notifications
     * 'error': Connection error
     */
    newSocket.on('connect', () => {
      console.log('Socket connected');
    });
    
    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
    
    /**
     * Handle incoming notification
     * 
     * This is called when server emits 'notification' event
     * which happens when Redis Pub/Sub receives a message
     */
    newSocket.on('notification', (data) => {
      console.log('New notification received:', data);
      
      // Increment unread count
      setUnreadCount(prev => prev + 1);
      
      // Show toast notification
      toast(data.notification?.message || 'You have a new notification', {
        icon: '🔔',
        duration: 4000
      });
    });
    
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });
    
    setSocket(newSocket);
    
    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, [user]);
  
  /**
   * Fetch unread count on user change
   */
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);
  
  /**
   * Mark notifications as read
   */
  const markAsRead = async (notificationIds) => {
    try {
      await notificationsAPI.markAsRead(notificationIds);
      // Decrease count by number of items marked
      const count = notificationIds ? notificationIds.length : 0;
      setUnreadCount(prev => Math.max(0, prev - count));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };
  
  /**
   * Mark all as read
   */
  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };
  
  /**
   * Refresh count from server
   */
  const refreshCount = () => {
    fetchUnreadCount();
  };
  
  const value = {
    unreadCount,
    markAsRead,
    markAllAsRead,
    refreshCount
  };
  
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  
  return context;
}
