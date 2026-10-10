/**
 * services/candleService.js
 * 
 * CANDLESTICK OHLCV GENERATOR
 * 
 * Aggregates trades into standard Open-High-Low-Close-Volume bars
 * for user charts and historical analysis.
 */

const Trade = require('../models/Trade');

class CandleService {
  /**
   * Parse interval string into milliseconds (e.g. '1m', '5m', '1h')
   */
  _parseIntervalMs(intervalStr = '1m') {
    const match = String(intervalStr).match(/^(\d+)([smhd])$/i);
    if (!match) return 60 * 1000; // default 1 minute
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 's': return val * 1000;
      case 'm': return val * 60 * 1000;
      case 'h': return val * 3600 * 1000;
      case 'd': return val * 86400 * 1000;
      default: return 60 * 1000;
    }
  }

  /**
   * Fetch candlestick OHLCV data for a symbol.
   * @param {string} symbol 
   * @param {string} interval - '1m', '5m', etc.
   * @param {number} limit - maximum number of candles
   */
  async getCandles(symbol, interval = '1m', limit = 100) {
    const sym = symbol.toUpperCase();
    const intervalMs = this._parseIntervalMs(interval);

    // Fetch trades for symbol sorted by timestamp ascending
    const trades = await Trade.find({ symbol: sym })
      .sort({ timestamp: 1 })
      .lean();

    if (trades.length === 0) {
      return [];
    }

    const candleMap = new Map();

    for (const trade of trades) {
      const tradeTime = new Date(trade.timestamp).getTime();
      // Bucket into time interval slot
      const bucketTime = Math.floor(tradeTime / intervalMs) * intervalMs;

      let candle = candleMap.get(bucketTime);
      if (!candle) {
        candle = {
          timestamp: bucketTime,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.quantity
        };
        candleMap.set(bucketTime, candle);
      } else {
        candle.high = Math.max(candle.high, trade.price);
        candle.low = Math.min(candle.low, trade.price);
        candle.close = trade.price;
        candle.volume += trade.quantity;
      }
    }

    const candles = Array.from(candleMap.values());
    return candles.slice(-limit);
  }
}

module.exports = new CandleService();
