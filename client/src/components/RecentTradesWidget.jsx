import React from 'react';

export default function RecentTradesWidget({ trades = [], symbol }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Trade Tape ({symbol})</span>
        <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
          Real-time
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th className="num">Price (₹)</th>
            <th className="num">Qty</th>
            <th>Side</th>
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ textAlign: 'center', color: '#999', padding: '15px' }}>
                No recent trades
              </td>
            </tr>
          ) : (
            trades.slice(0, 30).map((t, idx) => {
              const timeStr = new Date(t.timestamp).toLocaleTimeString();
              const priceStr = (t.price / 100).toFixed(2);
              const isBuyAggressor = t.aggressorSide === 'BUY';

              return (
                <tr key={t.tradeId || idx}>
                  <td style={{ color: '#777', fontSize: '11px' }}>{timeStr}</td>
                  <td className={`num ${isBuyAggressor ? 'bid-text' : 'ask-text'}`}>
                    {priceStr}
                  </td>
                  <td className="num">{t.quantity}</td>
                  <td>
                    <span
                      style={{
                        fontSize: '11px',
                        color: isBuyAggressor ? '#15803d' : '#b91c1c',
                        fontWeight: 500
                      }}
                    >
                      {t.aggressorSide}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
