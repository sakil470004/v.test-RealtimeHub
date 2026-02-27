/**
 * ===========================================
 * API SERVICE
 * ===========================================
 * 
 * LEARNING: Centralized API Configuration
 * 
 * Benefits:
 * - Single source of truth for API URL
 * - Automatic token injection
 * - Request/Response interceptors
 * - Centralized error handling
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * LEARNING: Axios Instance
 * 
 * Creating a configured axios instance:
 * - Sets base URL
 * - Sets default headers
 * - Allows adding interceptors
 */
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * LEARNING: Request Interceptor
 * 
 * Runs BEFORE every request is sent
 * 
 * Use cases:
 * - Add auth token to every request
 * - Add timestamps
 * - Transform request data
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * LEARNING: Response Interceptor
 * 
 * Runs AFTER every response is received
 * 
 * Use cases:
 * - Handle global errors (401, 500)
 * - Transform response data
 * - Refresh tokens
 */
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ===========================================
// AUTH API
// ===========================================
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/password', data)
};

// ===========================================
// POSTS API
// ===========================================
export const postsAPI = {
  getFeed: (params) => api.get('/posts/feed', { params }),
  getPost: (id) => api.get(`/posts/${id}`),
  getUserPosts: (userId, params) => api.get(`/posts/user/${userId}`, { params }),
  create: (data) => api.post('/posts', data),
  update: (id, data) => api.put(`/posts/${id}`, data),
  delete: (id) => api.delete(`/posts/${id}`)
};

// ===========================================
// USERS API
// ===========================================
export const usersAPI = {
  getProfile: (userId) => api.get(`/users/${userId}`),
  getUserPosts: (userId, params) => api.get(`/posts/user/${userId}`, { params }),
  updateProfile: (data) => api.put('/users/profile', data)
};

// ===========================================
// COMMENTS API
// ===========================================
export const commentsAPI = {
  getByPost: (postId, params) => api.get(`/comments/post/${postId}`, { params }),
  getReplies: (commentId, params) => api.get(`/comments/${commentId}/replies`, { params }),
  create: (postId, data) => api.post(`/comments/post/${postId}`, data),
  update: (id, data) => api.put(`/comments/${id}`, data),
  delete: (id) => api.delete(`/comments/${id}`)
};

// ===========================================
// LIKES API
// ===========================================
export const likesAPI = {
  toggle: (postId) => api.post(`/likes/toggle/${postId}`),
  getStatus: (postId) => api.get(`/likes/${postId}/status`),
  getBatch: (postIds) => api.post('/likes/status-batch', { postIds }),
  getUsers: (postId, params) => api.get(`/likes/${postId}/users`, { params })
};

// ===========================================
// NOTIFICATIONS API
// ===========================================
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread/count'),
  markAsRead: (notificationIds) => api.put('/notifications/read', { notificationIds }),
  markAllAsRead: () => api.put('/notifications/read/all')
};

export default api;
