import React from 'react';
import { cancelOrder } from '../api';

export default function MyOrdersWidget({ orders = [], onOrderCancelled }) {
  const handleCancel = async (orderId) => {
    try {
      await cancelOrder(orderId);
      if (onOrderCancelled) onOrderCancelled();
    } catch (err) {
      alert(`Failed to cancel order: ${err.message}`);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return <span className="badge badge-open">OPEN</span>;
      case 'PARTIALLY_FILLED':
        return <span className="badge badge-part">PARTIAL</span>;
      case 'FILLED':
        return <span className="badge badge-filled">FILLED</span>;
      case 'CANCELLED':
        return <span className="badge badge-cancelled">CANCELLED</span>;
      case 'REJECTED':
        return <span className="badge badge-rejected">REJECTED</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>My Orders</span>
        <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
          {orders.length} orders
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th className="num">Price (₹)</th>
              <th className="num">Filled / Qty</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', color: '#999', padding: '15px' }}>
                  No orders placed yet
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const isCancellable =
                  ord.status === 'OPEN' || ord.status === 'PARTIALLY_FILLED';
                const timeStr = new Date(ord.createdAt).toLocaleTimeString();
                const priceStr = ord.price ? (ord.price / 100).toFixed(2) : 'MARKET';

                return (
                  <tr key={ord.orderId}>
                    <td style={{ color: '#666', fontSize: '11px' }}>{timeStr}</td>
                    <td><strong>{ord.symbol}</strong></td>
                    <td className={ord.side === 'BUY' ? 'bid-text' : 'ask-text'}>
                      {ord.side}
                    </td>
                    <td>{ord.type}</td>
                    <td className="num">{priceStr}</td>
                    <td className="num">
                      {ord.filledQty} / {ord.originalQty}
                    </td>
                    <td>{getStatusBadge(ord.status)}</td>
                    <td>
                      {isCancellable && (
                        <button
                          className="btn btn-sm btn-danger-outline"
                          onClick={() => handleCancel(ord.orderId)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
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
