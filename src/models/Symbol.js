/**
 * models/Symbol.js
 * 
 * TRADABLE ASSET / SYMBOL MODEL
 */

const mongoose = require('mongoose');

const SymbolSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: [true, 'Symbol ticker is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Asset name is required'],
    trim: true
  },
  tickSize: {
    type: Number,
    required: true,
    default: 5, // 5 paise = Rs 0.05
    min: [1, 'Tick size must be at least 1 paise']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPaused: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Symbol', SymbolSchema);
