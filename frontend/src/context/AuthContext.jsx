/**
 * ===========================================
 * AUTHENTICATION CONTEXT
 * ===========================================
 * 
 * LEARNING: React Context for Global State
 * 
 * Context allows sharing state across components
 * without passing props through every level
 * 
 * PATTERN:
 * 1. Create context with createContext()
 * 2. Create Provider component with state
 * 3. Create custom hook for easy access
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api.js';
import toast from 'react-hot-toast';

// Create the context
const AuthContext = createContext(null);

/**
 * LEARNING: Context Provider
 * 
 * Wraps the app and provides auth state/functions
 * to all child components
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  /**
   * LEARNING: Initial Auth Check
   * 
   * On app load:
   * 1. Check if token exists in localStorage
   * 2. If yes, verify token by calling /auth/me
   * 3. Set user state based on result
   */
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        const response = await authAPI.getMe();
        setUser(response.data.data.user);
      } catch (error) {
        // Token invalid or expired
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  /**
   * Login function
   */
  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });
      const { user, token } = response.data.data;
      
      // Store token
      localStorage.setItem('token', token);
      
      // Set user state
      setUser(user);
      
      toast.success('Welcome back!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };
  
  /**
   * Register function
   */
  const register = async (username, email, password) => {
    try {
      const response = await authAPI.register({ username, email, password });
      const { user, token } = response.data.data;
      
      localStorage.setItem('token', token);
      setUser(user);
      
      toast.success('Welcome to RealtimeHub!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };
  
  /**
   * Logout function
   */
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    toast.success('Logged out');
  };
  
  /**
   * Update user profile
   */
  const updateProfile = async (data) => {
    try {
      const response = await authAPI.updateProfile(data);
      setUser(response.data.data.user);
      toast.success('Profile updated');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Update failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };
  
  // Context value
  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * LEARNING: Custom Hook for Context
 * 
 * Instead of: useContext(AuthContext)
 * Use: useAuth()
 * 
 * Benefits:
 * - Cleaner syntax
 * - Can add validation
 * - Better error messages
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  return context;
}
