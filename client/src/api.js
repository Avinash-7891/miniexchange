/**
 * client/src/api.js
 * 
 * REST API CLIENT HELPERS
 */

const BASE_URL = '/api';

export function getToken() {
  return localStorage.getItem('miniexchange_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('miniexchange_token', token);
  else localStorage.removeItem('miniexchange_token');
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

// Authentication
export const login = (email, password) =>
  request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const signup = (email, password) =>
  request('/signup', { method: 'POST', body: JSON.stringify({ email, password }) });

export const getMe = () => request('/me');

// Trading
export const getSymbols = () => request('/symbols');

export const getOrderBook = (symbol) => request(`/orderbook/${symbol}`);

export const submitOrder = (order) =>
  request('/orders', { method: 'POST', body: JSON.stringify(order) });

export const cancelOrder = (orderId) =>
  request(`/orders/${orderId}`, { method: 'DELETE' });

export const getMyOrders = (symbol = null) =>
  request(`/orders/my${symbol ? `?symbol=${symbol}` : ''}`);

// User Portfolio & History
export const getWallet = () => request('/wallet');

export const getMyTrades = () => request('/trades/my');

// Market Data
export const getRecentTrades = (symbol) => request(`/trades/recent/${symbol}`);

export const getCandles = (symbol, interval = '1m') =>
  request(`/candles/${symbol}?interval=${interval}`);

// Admin API
export const getAdminStats = () => request('/admin/stats');

export const getAdminUsers = () => request('/admin/users');

export const freezeUser = (id) => request(`/admin/users/${id}/freeze`, { method: 'POST' });

export const unfreezeUser = (id) => request(`/admin/users/${id}/unfreeze`, { method: 'POST' });

export const grantFunds = (id, payload) =>
  request(`/admin/users/${id}/grant`, { method: 'POST', body: JSON.stringify(payload) });

export const getAdminOrders = () => request('/admin/orders');

export const adminCancelOrder = (id) => request(`/admin/orders/${id}`, { method: 'DELETE' });

export const getAdminTrades = () => request('/admin/trades');

export const pauseMarket = (symbol = null) =>
  request('/admin/market/pause', { method: 'POST', body: JSON.stringify({ symbol }) });

export const resumeMarket = (symbol = null) =>
  request('/admin/market/resume', { method: 'POST', body: JSON.stringify({ symbol }) });

export const addSymbol = (symbol, name, tickSize) =>
  request('/admin/symbols', { method: 'POST', body: JSON.stringify({ symbol, name, tickSize }) });
