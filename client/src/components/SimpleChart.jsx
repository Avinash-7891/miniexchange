import React from 'react';

export default function SimpleChart({ candles = [], symbol, interval = '1m', onIntervalChange }) {
  if (candles.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span>Price Chart ({symbol})</span>
        </div>
        <div className="empty-state">No candlestick data available for {symbol} yet</div>
      </div>
    );
  }

  // Calculate high and low across all candles
  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  const maxPrice = Math.max(...allHighs);
  const minPrice = Math.min(...allLows);
  const priceRange = maxPrice === minPrice ? 1 : maxPrice - minPrice;

  const svgWidth = 600;
  const svgHeight = 180;
  const paddingY = 15;
  const plotHeight = svgHeight - paddingY * 2;

  const candleWidth = Math.max(4, Math.floor((svgWidth - 40) / candles.length) - 2);

  const getY = (val) => {
    const norm = (val - minPrice) / priceRange;
    return svgHeight - paddingY - norm * plotHeight;
  };

  const lastCandle = candles[candles.length - 1];
  const lastPriceRs = (lastCandle.close / 100).toFixed(2);

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>Price Chart ({symbol})</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#111' }}>
            ₹{lastPriceRs}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {['1m', '5m', '15m'].map((int) => (
            <button
              key={int}
              className={`btn btn-sm ${interval === int ? 'btn-primary' : ''}`}
              onClick={() => onIntervalChange && onIntervalChange(int)}
            >
              {int}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: '180px', display: 'block', backgroundColor: '#fafafa' }}
        >
          {/* Grid lines and price markers */}
          <line x1="0" y1={getY(maxPrice)} x2={svgWidth} y2={getY(maxPrice)} stroke="#e5e5e5" strokeDasharray="3,3" />
          <text x={svgWidth - 5} y={getY(maxPrice) + 10} textAnchor="end" fontSize="10" fill="#888">
            ₹{(maxPrice / 100).toFixed(2)}
          </text>

          <line x1="0" y1={getY(minPrice)} x2={svgWidth} y2={getY(minPrice)} stroke="#e5e5e5" strokeDasharray="3,3" />
          <text x={svgWidth - 5} y={getY(minPrice) - 3} textAnchor="end" fontSize="10" fill="#888">
            ₹{(minPrice / 100).toFixed(2)}
          </text>

          {/* Render Candlesticks */}
          {candles.map((c, i) => {
            const x = 15 + i * (candleWidth + 2);
            const isGreen = c.close >= c.open;
            const color = isGreen ? '#15803d' : '#b91c1c';

            const yHigh = getY(c.high);
            const yLow = getY(c.low);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);

            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={x + candleWidth / 2}
                  y1={yHigh}
                  x2={x + candleWidth / 2}
                  y2={yLow}
                  stroke={color}
                  strokeWidth="1"
                />
                {/* Candle Body */}
                <rect
                  x={x}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={isGreen ? '#dcfce7' : '#fee2e2'}
                  stroke={color}
                  strokeWidth="1"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
