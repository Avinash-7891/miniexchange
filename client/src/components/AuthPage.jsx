import React, { useState } from 'react';
import { login, signup, setToken } from '../api';

export default function AuthPage({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = isLogin ? await login(email, password) : await signup(email, password);
      setToken(res.token);
      onAuthSuccess(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setIsLogin(true);
    setError(null);
  };

  return (
    <div style={{ maxWidth: '420px', margin: '40px auto' }}>
      <div className="panel">
        <div className="panel-header">
          <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
          <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
            {isLogin ? 'Need an account?' : 'Already have an account?'}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#0044cc',
                cursor: 'pointer',
                marginLeft: '4px',
                textDecoration: 'underline'
              }}
            >
              {isLogin ? 'Sign Up' : 'Log In'}
            </button>
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@miniexchange.local"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '5px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#777', marginBottom: '8px' }}>
            Quick Demo Autofill:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fillCredentials('alice@miniexchange.local', 'alice123')}
            >
              Alice (Trader)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fillCredentials('bob@miniexchange.local', 'bob123')}
            >
              Bob (Trader)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fillCredentials('charlie@miniexchange.local', 'charlie123')}
            >
              Charlie (Trader)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fillCredentials('admin@miniexchange.local', 'admin123')}
            >
              Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
