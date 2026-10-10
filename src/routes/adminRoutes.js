/**
 * routes/adminRoutes.js
 * 
 * ADMIN CONTROL PANEL API
 * 
 * Requires authenticated user with role: 'admin'.
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Trade = require('../models/Trade');
const Symbol = require('../models/Symbol');
const MarketState = require('../models/MarketState');
const engineManager = require('../services/engineManager');
const walletService = require('../services/walletService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Protect all admin routes with auth and admin role check
router.use(requireAuth, requireAdmin);

/**
 * GET /admin/stats
 * Aggregate exchange metrics (total users, total trades, volume today, turnover today)
 */
router.get('/stats', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTrades = await Trade.countDocuments();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const tradesToday = await Trade.find({ timestamp: { $gte: startOfToday } });
    const volumeToday = tradesToday.reduce((sum, t) => sum + t.quantity, 0);
    const turnoverToday = tradesToday.reduce((sum, t) => sum + (t.price * t.quantity), 0);

    const globalState = await MarketState.findOne({ key: 'global_state' });
    const isGlobalPaused = globalState ? globalState.isGlobalPaused : false;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalTrades,
        volumeToday,
        turnoverToday,
        isGlobalPaused
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/users
 * List all users with wallet balances
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/users/:id/freeze
 * Freeze user account (prevents trading)
 */
router.post('/users/:id/freeze', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFrozen: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User account frozen', user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/users/:id/unfreeze
 * Unfreeze user account
 */
router.post('/users/:id/unfreeze', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFrozen: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User account unfrozen', user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/users/:id/grant
 * Grant fake cash (paise) or asset units
 */
router.post('/users/:id/grant', async (req, res, next) => {
  try {
    const { cashPaise, symbol, units } = req.body;
    const user = await walletService.grantFunds(
      req.params.id,
      cashPaise ? parseInt(cashPaise, 10) : 0,
      symbol,
      units ? parseInt(units, 10) : 0
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'Funds successfully granted', user });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/orders
 * Inspect all orders across system
 */
router.get('/orders', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const orders = await Order.find()
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/orders/:id
 * Admin force-cancel any order
 */
router.delete('/orders/:id', async (req, res, next) => {
  try {
    const order = await engineManager.cancelOrder(req.params.id, null, true);
    res.json({ success: true, message: 'Order cancelled by admin', order });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/trades
 * Inspect all executed trades
 */
router.get('/trades', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const trades = await Trade.find()
      .populate('buyerId', 'email')
      .populate('sellerId', 'email')
      .sort({ timestamp: -1 })
      .limit(limit);
    res.json({ success: true, trades });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/market/pause
 * Pause trading globally or for a specific symbol
 */
router.post('/market/pause', async (req, res, next) => {
  try {
    const { symbol } = req.body;
    if (symbol) {
      const symDoc = await Symbol.findOneAndUpdate(
        { symbol: symbol.toUpperCase() },
        { isPaused: true },
        { new: true }
      );
      if (!symDoc) return res.status(404).json({ error: 'Symbol not found' });
      return res.json({ success: true, message: `Market for ${symbol} paused` });
    }

    await MarketState.findOneAndUpdate(
      { key: 'global_state' },
      { isGlobalPaused: true },
      { upsert: true }
    );
    res.json({ success: true, message: 'Global market paused' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/market/resume
 * Resume trading globally or for a specific symbol
 */
router.post('/market/resume', async (req, res, next) => {
  try {
    const { symbol } = req.body;
    if (symbol) {
      const symDoc = await Symbol.findOneAndUpdate(
        { symbol: symbol.toUpperCase() },
        { isPaused: false },
        { new: true }
      );
      if (!symDoc) return res.status(404).json({ error: 'Symbol not found' });
      return res.json({ success: true, message: `Market for ${symbol} resumed` });
    }

    await MarketState.findOneAndUpdate(
      { key: 'global_state' },
      { isGlobalPaused: false },
      { upsert: true }
    );
    res.json({ success: true, message: 'Global market resumed' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/symbols
 * Add a new tradable symbol to the exchange
 */
router.post('/symbols', async (req, res, next) => {
  try {
    const { symbol, name, tickSize = 5 } = req.body;
    if (!symbol || !name) {
      return res.status(400).json({ error: 'Symbol ticker and name are required' });
    }

    const symUpper = symbol.toUpperCase().trim();
    const existing = await Symbol.findOne({ symbol: symUpper });
    if (existing) {
      return res.status(400).json({ error: `Symbol ${symUpper} already exists` });
    }

    const newSymbol = await Symbol.create({
      symbol: symUpper,
      name: name.trim(),
      tickSize: parseInt(tickSize, 10) || 5,
      isActive: true,
      isPaused: false
    });

    // Register into in-memory engine manager
    engineManager.registerSymbol(symUpper, newSymbol.tickSize);

    res.status(201).json({ success: true, symbol: newSymbol });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
