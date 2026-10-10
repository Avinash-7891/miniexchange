import React, { useState, useEffect } from 'react';
import {
  getAdminStats,
  getAdminUsers,
  freezeUser,
  unfreezeUser,
  grantFunds,
  getAdminOrders,
  adminCancelOrder,
  getAdminTrades,
  pauseMarket,
  resumeMarket,
  addSymbol
} from '../api';

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  // Grant funds form state
  const [grantUserId, setGrantUserId] = useState('');
  const [grantCashRs, setGrantCashRs] = useState('');
  const [grantSymbol, setGrantSymbol] = useState('RELI');
  const [grantUnits, setGrantUnits] = useState('');

  // Add symbol form state
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newTick, setNewTick] = useState('5');

  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const loadAll = async () => {
    try {
      const [sRes, uRes, oRes, tRes] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminOrders(),
        getAdminTrades()
      ]);
      setStats(sRes.stats);
      setUsers(uRes.users || []);
      setOrders(oRes.orders || []);
      setTrades(tRes.trades || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleMarketPause = async () => {
    try {
      if (stats?.isGlobalPaused) {
        await resumeMarket();
        setMessage('Market resumed successfully');
      } else {
        await pauseMarket();
        setMessage('Market paused successfully (Circuit Breaker Triggered)');
      }
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFreezeToggle = async (user) => {
    try {
      if (user.isFrozen) {
        await unfreezeUser(user._id);
        setMessage(`User ${user.email} unfrozen`);
      } else {
        await freezeUser(user._id);
        setMessage(`User ${user.email} frozen`);
      }
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGrantFunds = async (e) => {
    e.preventDefault();
    try {
      const cashPaise = grantCashRs ? Math.round(parseFloat(grantCashRs) * 100) : 0;
      const units = grantUnits ? parseInt(grantUnits, 10) : 0;
      await grantFunds(grantUserId, { cashPaise, symbol: grantSymbol, units });
      setMessage('Funds granted successfully');
      setGrantCashRs('');
      setGrantUnits('');
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddSymbol = async (e) => {
    e.preventDefault();
    try {
      await addSymbol(newSymbol, newName, parseInt(newTick, 10));
      setMessage(`Symbol ${newSymbol.toUpperCase()} added successfully`);
      setNewSymbol('');
      setNewName('');
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await adminCancelOrder(orderId);
      setMessage(`Order ${orderId} cancelled by admin`);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      {/* Admin Subnav */}
      <div className="panel" style={{ display: 'flex', gap: '10px', padding: '10px 15px', marginBottom: '15px' }}>
        <button className={`btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('overview')}>
          Dashboard Stats
        </button>
        <button className={`btn btn-sm ${activeTab === 'users' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('users')}>
          User Management ({users.length})
        </button>
        <button className={`btn btn-sm ${activeTab === 'orders' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('orders')}>
          All Orders ({orders.length})
        </button>
        <button className={`btn btn-sm ${activeTab === 'trades' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('trades')}>
          All Trades ({trades.length})
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* TAB 1: OVERVIEW & STATS */}
      {activeTab === 'overview' && (
        <div>
          <div className="panel">
            <div className="panel-header">
              <span>Exchange Metrics</span>
              <button
                className={`btn btn-sm ${stats?.isGlobalPaused ? 'btn-buy' : 'btn-sell'}`}
                onClick={handleToggleMarketPause}
              >
                {stats?.isGlobalPaused ? 'RESUME GLOBAL MARKET' : 'EMERGENCY PAUSE MARKET'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', textAlign: 'center' }}>
              <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Registered Users</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '5px' }}>{stats?.totalUsers || 0}</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Total Trades Executed</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '5px' }}>{stats?.totalTrades || 0}</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Volume Today (Units)</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#15803d', marginTop: '5px' }}>
                  {stats?.volumeToday || 0}
                </div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Turnover Today (INR)</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0044cc', marginTop: '5px' }}>
                  ₹{stats?.turnoverToday ? (stats.turnoverToday / 100).toFixed(2) : '0.00'}
                </div>
              </div>
            </div>
          </div>

          {/* Add Symbol Form */}
          <div className="panel">
            <div className="panel-header">Add Tradable Symbol</div>
            <form onSubmit={handleAddSymbol} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <label>Ticker</label>
                <input required placeholder="e.g. SBIN" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} />
              </div>
              <div>
                <label>Company Name</label>
                <input required placeholder="e.g. State Bank of India" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div>
                <label>Tick Size (paise)</label>
                <input type="number" required value={newTick} onChange={(e) => setNewTick(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: '35px' }}>
                Create Symbol
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: USERS & GRANT FUNDS */}
      {activeTab === 'users' && (
        <div>
          {/* Grant Funds Panel */}
          <div className="panel">
            <div className="panel-header">Grant Fake Cash or Stock Units</div>
            <form onSubmit={handleGrantFunds} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <label>Select User</label>
                <select required value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)}>
                  <option value="">-- Choose User --</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.email} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Add Cash (₹)</label>
                <input type="number" placeholder="e.g. 50000" value={grantCashRs} onChange={(e) => setGrantCashRs(e.target.value)} />
              </div>
              <div>
                <label>Symbol</label>
                <input value={grantSymbol} onChange={(e) => setGrantSymbol(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label>Add Units</label>
                <input type="number" placeholder="e.g. 100" value={grantUnits} onChange={(e) => setGrantUnits(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: '35px' }}>
                Grant Funds
              </button>
            </form>
          </div>

          <div className="panel">
            <div className="panel-header">User Directory</div>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th className="num">Avail Cash (₹)</th>
                  <th className="num">Locked Cash (₹)</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td><strong>{u.email}</strong></td>
                    <td>{u.role}</td>
                    <td className="num">₹{(u.cash?.available / 100).toFixed(2)}</td>
                    <td className="num" style={{ color: '#b45309' }}>₹{(u.cash?.locked / 100).toFixed(2)}</td>
                    <td>
                      {u.isFrozen ? (
                        <span className="badge badge-rejected">FROZEN</span>
                      ) : (
                        <span className="badge badge-filled">ACTIVE</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${u.isFrozen ? 'btn-buy' : 'btn-danger-outline'}`}
                        onClick={() => handleFreezeToggle(u)}
                      >
                        {u.isFrozen ? 'Unfreeze' : 'Freeze'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ALL ORDERS */}
      {activeTab === 'orders' && (
        <div className="panel">
          <div className="panel-header">System Orders</div>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Order ID</th>
                <th>User</th>
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
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td style={{ color: '#666', fontSize: '11px' }}>{new Date(o.createdAt).toLocaleTimeString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{o.orderId}</td>
                  <td>{o.userId?.email || 'User'}</td>
                  <td><strong>{o.symbol}</strong></td>
                  <td className={o.side === 'BUY' ? 'bid-text' : 'ask-text'}>{o.side}</td>
                  <td>{o.type}</td>
                  <td className="num">{o.price ? (o.price / 100).toFixed(2) : 'MARKET'}</td>
                  <td className="num">{o.filledQty} / {o.originalQty}</td>
                  <td><span className={`badge badge-${o.status.toLowerCase()}`}>{o.status}</span></td>
                  <td>
                    {(o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED') && (
                      <button className="btn btn-sm btn-danger-outline" onClick={() => handleCancelOrder(o.orderId)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: ALL TRADES */}
      {activeTab === 'trades' && (
        <div className="panel">
          <div className="panel-header">System Trades</div>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Trade ID</th>
                <th>Symbol</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th className="num">Price (₹)</th>
                <th className="num">Qty</th>
                <th className="num">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.tradeId}>
                  <td style={{ color: '#666', fontSize: '11px' }}>{new Date(t.timestamp).toLocaleTimeString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{t.tradeId}</td>
                  <td><strong>{t.symbol}</strong></td>
                  <td className="bid-text">{t.buyerId?.email || 'Buyer'}</td>
                  <td className="ask-text">{t.sellerId?.email || 'Seller'}</td>
                  <td className="num">₹{(t.price / 100).toFixed(2)}</td>
                  <td className="num">{t.quantity}</td>
                  <td className="num">₹{((t.price * t.quantity) / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
