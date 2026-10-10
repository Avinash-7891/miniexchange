/**
 * routes/walletRoutes.js
 * 
 * USER PORTFOLIO & PRIVATE TRADE HISTORY
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Trade = require('../models/Trade');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /wallet
 * Retrieve authenticated user's cash balance and portfolio holdings
 */
router.get('/wallet', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      cash: user.cash,
      holdings: user.holdings
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /trades/my
 * Retrieve my LAST 30 trades (as buyer OR seller, newest first).
 * Anonymized: counterparty's identity is strictly hidden.
 */
router.get('/trades/my', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;

    const rawTrades = await Trade.find({
      $or: [
        { buyerId: userId },
        { sellerId: userId }
      ]
    })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    const formattedTrades = rawTrades.map((t) => {
      const isBuyer = t.buyerId.toString() === userId.toString();
      const mySide = isBuyer ? 'BUY' : 'SELL';
      const totalCost = t.price * t.quantity;

      return {
        tradeId: t.tradeId,
        symbol: t.symbol,
        side: mySide,
        price: t.price, // in paise
        quantity: t.quantity,
        total: totalCost, // in paise
        timestamp: t.timestamp
      };
    });

    res.json({
      success: true,
      trades: formattedTrades
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
