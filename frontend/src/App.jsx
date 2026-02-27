/**
 * ===========================================
 * APP COMPONENT
 * ===========================================
 * 
 * Main application component with:
 * - React Router for navigation
 * - Authentication context
 * - Notification context
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Context providers
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';

// Pages
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import Notifications from './pages/Notifications.jsx';

// Components
import Navbar from './components/Navbar.jsx';

/**
 * LEARNING: Protected Routes
 * 
 * Some pages should only be accessible to logged-in users
 * ProtectedRoute checks auth status and redirects if needed
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="container" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

/**
 * LEARNING: Public Only Routes
 * 
 * Login/Register pages should redirect to feed if already logged in
 */
function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="container" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/" replace />;
  }
  
  return children;
}

/**
 * Main App Layout
 */
function AppLayout() {
  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          {/* Public routes */}
          <Route 
            path="/login" 
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            } 
          />
          <Route 
            path="/register" 
            element={
              <PublicOnlyRoute>
                <Register />
              </PublicOnlyRoute>
            } 
          />
          
          {/* Protected routes */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Feed />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile/:userId?" 
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/notifications" 
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            } 
          />
          
          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

/**
 * Root App Component
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppLayout />
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#333',
                color: '#fff',
              },
            }}
          />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
