/**
 * models/Trade.js
 * 
 * PERSISTENT TRADE & LEDGER AUDIT LOG
 */

const mongoose = require('mongoose');
const { Side } = require('../engine/types');

const TradeSchema = new mongoose.Schema({
  tradeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  price: {
    type: Number, // Integer in Paise
    required: true
  },
  quantity: {
    type: Number, // Integer units
    required: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  buyOrderId: {
    type: String,
    required: true
  },
  sellOrderId: {
    type: String,
    required: true
  },
  aggressorSide: {
    type: String,
    enum: Object.values(Side),
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for Section 10 & 9 requirement:
// Fast query for user's last 30 trades (as buyer OR seller, newest first)
TradeSchema.index({ buyerId: 1, timestamp: -1 });
TradeSchema.index({ sellerId: 1, timestamp: -1 });
TradeSchema.index({ symbol: 1, timestamp: -1 });

module.exports = mongoose.model('Trade', TradeSchema);
