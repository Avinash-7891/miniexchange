import React, { useState, useEffect } from 'react';
import { getWallet } from '../api';
import { wsClient } from '../ws';

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadWallet = () => {
    getWallet()
      .then((res) => setWallet(res))
      .catch((err) => console.error('Failed to load wallet:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWallet();

    const unsub = wsClient.on('user_wallet_update', (msg) => {
      if (msg.data) {
        setWallet({
          cash: msg.data.cash,
          holdings: msg.data.holdings
        });
      }
    });

    return () => unsub();
  }, []);

  if (loading) {
    return <div className="panel"><div className="empty-state">Loading portfolio...</div></div>;
  }

  if (!wallet) {
    return <div className="panel"><div className="empty-state">Failed to load wallet information</div></div>;
  }

  const { cash = { available: 0, locked: 0 }, holdings = {} } = wallet;
  const availCashRs = (cash.available / 100).toFixed(2);
  const lockedCashRs = (cash.locked / 100).toFixed(2);
  const totalCashRs = ((cash.available + cash.locked) / 100).toFixed(2);

  // Convert holdings map/object to array
  const holdingsList = Object.entries(holdings).map(([symbol, data]) => ({
    symbol,
    available: data.available || 0,
    locked: data.locked || 0,
    total: (data.available || 0) + (data.locked || 0)
  }));

  return (
    <div>
      {/* Cash Ledger Summary */}
      <div className="panel">
        <div className="panel-header">Cash Balance (INR)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', textAlign: 'center' }}>
          <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666' }}>Available Cash</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#15803d', marginTop: '5px' }}>
              ₹{availCashRs}
            </div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666' }}>Locked in Open Orders</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#b45309', marginTop: '5px' }}>
              ₹{lockedCashRs}
            </div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666' }}>Total Net Cash</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111', marginTop: '5px' }}>
              ₹{totalCashRs}
            </div>
          </div>
        </div>
      </div>

      {/* Stock Holdings */}
      <div className="panel">
        <div className="panel-header">Asset Holdings</div>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="num">Available Units</th>
              <th className="num">Locked Units</th>
              <th className="num">Total Units</th>
            </tr>
          </thead>
          <tbody>
            {holdingsList.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', color: '#999', padding: '15px' }}>
                  No stock holdings currently in portfolio
                </td>
              </tr>
            ) : (
              holdingsList.map((h) => (
                <tr key={h.symbol}>
                  <td><strong>{h.symbol}</strong></td>
                  <td className="num bid-text">{h.available}</td>
                  <td className="num" style={{ color: '#b45309' }}>{h.locked}</td>
                  <td className="num" style={{ fontWeight: 'bold' }}>{h.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
