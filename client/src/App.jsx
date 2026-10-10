import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import TradingPage from './components/TradingPage';
import WalletPage from './components/WalletPage';
import MyTradesPage from './components/MyTradesPage';
import AdminPage from './components/AdminPage';
import AuthPage from './components/AuthPage';
import { getMe, setToken, getToken } from './api';
import { wsClient } from './ws';

export default function App() {
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState('trading');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Start WebSocket connection
    wsClient.connect();

    const token = getToken();
    if (token) {
      getMe()
        .then((res) => {
          if (res.user) setUser(res.user);
        })
        .catch(() => {
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setActivePage('trading');
  };

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    setActivePage('trading');
    wsClient.connect(); // Reconnect to update authenticated WS state
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>
        Loading MiniExchange...
      </div>
    );
  }

  return (
    <div>
      <Navbar
        user={user}
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {activePage === 'trading' && <TradingPage user={user} />}
        {activePage === 'wallet' && user && <WalletPage />}
        {activePage === 'trades' && user && <MyTradesPage />}
        {activePage === 'admin' && user?.role === 'admin' && <AdminPage />}
        {activePage === 'auth' && <AuthPage onAuthSuccess={handleAuthSuccess} />}
      </main>
    </div>
  );
}
