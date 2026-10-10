/**
 * routes/tradingRoutes.js
 * 
 * CORE TRADING API (Orders, OrderBook Depth, Symbols)
 */

const express = require('express');
const router = express.Router();
const engineManager = require('../services/engineManager');
const Order = require('../models/Order');
const Symbol = require('../models/Symbol');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /symbols
 * List all available tradable symbols
 */
router.get('/symbols', async (req, res, next) => {
  try {
    const symbols = await Symbol.find({ isActive: true });
    res.json({ success: true, symbols });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /orderbook/:symbol
 * Fetch aggregated order book depth snapshot
 */
router.get('/orderbook/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const book = engineManager.getBook(symbol);
    if (!book) {
      return res.status(404).json({ error: `Symbol ${symbol} not found` });
    }
    const depth = book.getDepth(20);
    res.json({ success: true, ...depth });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /orders
 * Place a new BUY or SELL limit/market order
 */
router.post('/orders', requireAuth, async (req, res, next) => {
  try {
    const { symbol, side, type, price, quantity } = req.body;

    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, side, type, quantity'
      });
    }

    const parsedQty = parseInt(quantity, 10);
    const parsedPrice = price !== undefined && price !== null ? parseInt(price, 10) : null;

    const result = await engineManager.submitOrder(req.user._id, {
      symbol,
      side,
      type,
      price: parsedPrice,
      quantity: parsedQty
    });

    res.status(201).json({
      success: true,
      order: result.order,
      trades: result.trades,
      bookDepth: result.bookDepth
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /orders/:id
 * Cancel an open or partially filled order
 */
router.delete('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const cancelledOrder = await engineManager.cancelOrder(orderId, req.user._id, false);
    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: cancelledOrder
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /orders/my
 * List current user's open and past orders
 */
router.get('/orders/my', requireAuth, async (req, res, next) => {
  try {
    const { status, symbol, limit = 50 } = req.query;
    const filter = { userId: req.user._id };

    if (status) {
      filter.status = status;
    }
    if (symbol) {
      filter.symbol = symbol.toUpperCase();
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      orders
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
