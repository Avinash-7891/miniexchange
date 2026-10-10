import React from 'react';

export default function OrderBookWidget({ book, onSelectPrice }) {
  if (!book) {
    return (
      <div className="panel">
        <div className="panel-header">Order Book</div>
        <div className="empty-state">Loading order book...</div>
      </div>
    );
  }

  const { bids = [], asks = [], spread, bestBid, bestAsk } = book;

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Order Book</span>
        <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
          {book.symbol}
        </span>
      </div>

      {/* Asks (Sells) Table */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c', marginBottom: '4px' }}>
          ASKS (SELLERS)
        </div>
        <table>
          <thead>
            <tr>
              <th>Price (₹)</th>
              <th className="num">Qty</th>
              <th className="num">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {asks.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', color: '#999', padding: '10px' }}>
                  No active asks
                </td>
              </tr>
            ) : (
              // Display asks in descending order (highest ask at top, best ask at bottom near spread)
              [...asks].reverse().map((level, idx) => {
                const priceInRs = (level.price / 100).toFixed(2);
                const totalInRs = ((level.price * level.volume) / 100).toFixed(2);
                return (
                  <tr
                    key={idx}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectPrice && onSelectPrice(priceInRs)}
                    title="Click to copy price to order form"
                  >
                    <td className="ask-text">{priceInRs}</td>
                    <td className="num">{level.volume}</td>
                    <td className="num" style={{ color: '#666' }}>{totalInRs}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Spread Indicator */}
      <div className="spread-banner">
        {spread !== null ? (
          <span>
            Spread: ₹{(spread / 100).toFixed(2)} ({spread} paise)
          </span>
        ) : (
          <span>No Spread (One or both sides empty)</span>
        )}
      </div>

      {/* Bids (Buys) Table */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '4px' }}>
          BIDS (BUYERS)
        </div>
        <table>
          <thead>
            <tr>
              <th>Price (₹)</th>
              <th className="num">Qty</th>
              <th className="num">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {bids.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', color: '#999', padding: '10px' }}>
                  No active bids
                </td>
              </tr>
            ) : (
              bids.map((level, idx) => {
                const priceInRs = (level.price / 100).toFixed(2);
                const totalInRs = ((level.price * level.volume) / 100).toFixed(2);
                return (
                  <tr
                    key={idx}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectPrice && onSelectPrice(priceInRs)}
                    title="Click to copy price to order form"
                  >
                    <td className="bid-text">{priceInRs}</td>
                    <td className="num">{level.volume}</td>
                    <td className="num" style={{ color: '#666' }}>{totalInRs}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
