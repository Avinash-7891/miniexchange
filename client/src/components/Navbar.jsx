import React from 'react';

export default function Navbar({ user, activePage, setActivePage, onLogout }) {
  return (
    <header>
      <div className="nav-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span className="brand">MiniExchange</span>
          <nav className="nav-links">
            <button
              className={`nav-btn ${activePage === 'trading' ? 'active' : ''}`}
              onClick={() => setActivePage('trading')}
            >
              Trading
            </button>
            {user && (
              <>
                <button
                  className={`nav-btn ${activePage === 'wallet' ? 'active' : ''}`}
                  onClick={() => setActivePage('wallet')}
                >
                  Portfolio
                </button>
                <button
                  className={`nav-btn ${activePage === 'trades' ? 'active' : ''}`}
                  onClick={() => setActivePage('trades')}
                >
                  My Trades
                </button>
                {user.role === 'admin' && (
                  <button
                    className={`nav-btn ${activePage === 'admin' ? 'active' : ''}`}
                    onClick={() => setActivePage('admin')}
                  >
                    Admin Panel
                  </button>
                )}
              </>
            )}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user ? (
            <>
              <span className="user-badge">
                {user.email} ({user.role})
              </span>
              <button className="btn btn-sm" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setActivePage('auth')}>
              Login / Signup
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
