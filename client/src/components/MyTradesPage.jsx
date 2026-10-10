import React, { useState, useEffect } from 'react';
import { getMyTrades } from '../api';

export default function MyTradesPage() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyTrades()
      .then((res) => setTrades(res.trades || []))
      .catch((err) => console.error('Failed to load trades:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <span>My Trade Execution History</span>
        <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
          Last 30 trades (Counterparties anonymized)
        </span>
      </div>

      {loading ? (
        <div className="empty-state">Loading your trades...</div>
      ) : trades.length === 0 ? (
        <div className="empty-state">You have not executed any trades yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Execution Time</th>
                <th>Trade ID</th>
                <th>Symbol</th>
                <th>My Side</th>
                <th className="num">Price (₹)</th>
                <th className="num">Quantity</th>
                <th className="num">Total Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const timeStr = new Date(t.timestamp).toLocaleString();
                const isBuy = t.side === 'BUY';
                const priceRs = (t.price / 100).toFixed(2);
                const totalRs = (t.total / 100).toFixed(2);

                return (
                  <tr key={t.tradeId}>
                    <td style={{ color: '#666', fontSize: '12px' }}>{timeStr}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#888' }}>
                      {t.tradeId}
                    </td>
                    <td><strong>{t.symbol}</strong></td>
                    <td className={isBuy ? 'bid-text' : 'ask-text'}>
                      <strong>{t.side}</strong>
                    </td>
                    <td className="num">{priceRs}</td>
                    <td className="num">{t.quantity}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{totalRs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
