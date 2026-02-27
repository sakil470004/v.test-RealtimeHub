/**
 * LOGIN PAGE
 * 
 * LEARNING: Controlled Forms in React
 * 
 * Form values are controlled by React state
 * - Value comes from state
 * - onChange updates state
 * - Form submission uses state values
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const handleSubmit = async (e) => {
    /**
     * LEARNING: preventDefault()
     * 
     * Forms have default browser behavior to reload page
     * preventDefault() stops that so React can handle it
     */
    e.preventDefault();
    
    // Validation
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      await login(email, password);
      navigate('/'); // Redirect to feed on success
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1>Welcome Back</h1>
        <p className="auth-subtitle">Sign in to RealtimeHub</p>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
