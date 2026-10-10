/**
 * models/Order.js
 * 
 * PERSISTENT ORDER AUDIT & RESTART LOG
 */

const mongoose = require('mongoose');
const { Side, OrderType, OrderStatus } = require('../engine/types');

const OrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  side: {
    type: String,
    enum: Object.values(Side),
    required: true
  },
  type: {
    type: String,
    enum: Object.values(OrderType),
    required: true
  },
  price: {
    type: Number, // Integer in Paise, null for MARKET orders
    default: null
  },
  originalQty: {
    type: Number,
    required: true,
    min: 1
  },
  remainingQty: {
    type: Number,
    required: true,
    min: 0
  },
  filledQty: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.OPEN,
    index: true
  },
  sequence: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for fast history and active order queries
OrderSchema.index({ symbol: 1, status: 1 });
OrderSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', OrderSchema);
