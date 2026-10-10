/**
 * routes/marketRoutes.js
 * 
 * PUBLIC MARKET DATA (Recent Trades & Candlesticks)
 */

const express = require('express');
const router = express.Router();
const Trade = require('../models/Trade');
const candleService = require('../services/candleService');

/**
 * GET /trades/recent/:symbol
 * Public tape of recent trades executed on this symbol
 */
router.get('/trades/recent/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const limit = parseInt(req.query.limit, 10) || 50;

    const trades = await Trade.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('tradeId symbol price quantity aggressorSide timestamp')
      .lean();

    res.json({
      success: true,
      symbol,
      trades
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /candles/:symbol?interval=1m
 * Candlestick OHLCV data for charts
 */
router.get('/candles/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval || '1m';
    const limit = parseInt(req.query.limit, 10) || 100;

    const candles = await candleService.getCandles(symbol, interval, limit);

    res.json({
      success: true,
      symbol,
      interval,
      candles
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
