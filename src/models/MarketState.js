/**
 * models/MarketState.js
 * 
 * GLOBAL EXCHANGE STATE (Emergency pause / resume)
 */

const mongoose = require('mongoose');

const MarketStateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global_state'
  },
  isGlobalPaused: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MarketState', MarketStateSchema);
