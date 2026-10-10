import React, { useState, useEffect } from 'react';
import { submitOrder } from '../api';

export default function OrderForm({ symbol, selectedPrice, onOrderPlaced }) {
  const [side, setSide] = useState('BUY');
  const [type, setType] = useState('LIMIT');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedPrice) {
      setPrice(selectedPrice);
    }
  }, [selectedPrice]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const parsedQty = parseInt(quantity, 10);
      if (!parsedQty || parsedQty <= 0) {
        throw new Error('Quantity must be a positive integer');
      }

      let parsedPricePaise = null;
      if (type === 'LIMIT') {
        const parsedPriceFloat = parseFloat(price);
        if (!parsedPriceFloat || parsedPriceFloat <= 0) {
          throw new Error('Price must be a positive number');
        }
        // Convert Rupees to integer Paise (e.g. Rs 100.05 -> 10005 paise)
        parsedPricePaise = Math.round(parsedPriceFloat * 100);
      }

      const res = await submitOrder({
        symbol,
        side,
        type,
        price: parsedPricePaise,
        quantity: parsedQty
      });

      const tradesCount = res.trades ? res.trades.length : 0;
      setSuccess(
        `Order placed successfully! Status: ${res.order.status}${
          tradesCount > 0 ? ` (${tradesCount} match executed)` : ''
        }`
      );
      setQuantity('');
      if (type === 'MARKET') setPrice('');
      if (onOrderPlaced) onOrderPlaced();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const estTotal =
    type === 'LIMIT' && price && quantity
      ? (parseFloat(price) * parseInt(quantity, 10)).toFixed(2)
      : null;

  return (
    <div className="panel">
      <div className="panel-header">Place Order ({symbol})</div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="side-toggle">
        <button
          type="button"
          className={side === 'BUY' ? 'active-buy' : ''}
          onClick={() => {
            setSide('BUY');
            setError(null);
          }}
        >
          BUY
        </button>
        <button
          type="button"
          className={side === 'SELL' ? 'active-sell' : ''}
          onClick={() => {
            setSide('SELL');
            setError(null);
          }}
        >
          SELL
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Order Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="LIMIT">Limit Order</option>
            <option value="MARKET">Market Order</option>
          </select>
        </div>

        {type === 'LIMIT' && (
          <div className="form-group">
            <label>Price (₹)</label>
            <input
              type="number"
              step="0.05"
              min="0.05"
              required
              placeholder="e.g. 100.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        )}

        <div className="form-group">
          <label>Quantity (Units)</label>
          <input
            type="number"
            step="1"
            min="1"
            required
            placeholder="e.g. 10"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        {estTotal && (
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
            Estimated Value: ₹{estTotal}
          </div>
        )}

        <button
          type="submit"
          className={`btn ${side === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
          disabled={loading}
        >
          {loading ? 'Submitting...' : `${side} ${symbol}`}
        </button>
      </form>
    </div>
  );
}
