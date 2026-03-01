/**
 * NAVBAR COMPONENT
 * 
 * Navigation bar with:
 * - Logo/Home link
 * - Notification bell with unread count
 * - User menu with profile and logout
 */

import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo */}
        <Link to="/" className="navbar-brand">
          RealtimeHub
        </Link>
        
        {/* Navigation Links */}
        <div className="navbar-links">
          {user ? (
            <>
              {/* Feed Link */}
              <Link to="/" className="nav-link">
                Home
              </Link>
              
              {/* Notifications with Badge */}
              <Link to="/notifications" className="nav-link notification-link">
                🔔
                {unreadCount > 0 && (
                  <span className="notification-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              
              {/* Profile Link */}
              <Link to={`/profile/${user.id}`} className="nav-link">
                Profile
              </Link>
              
              {/* Logout Button */}
              <button onClick={handleLogout} className="btn btn-secondary">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
