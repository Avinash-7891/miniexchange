/**
 * MiniExchange Core Types and Constants
 * 
 * Money and prices are ALWAYS represented as integers in Paise (1 INR = 100 paise).
 * Quantities are ALWAYS positive integers representing units of asset.
 */

const Side = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL'
});

const OrderType = Object.freeze({
  LIMIT: 'LIMIT',
  MARKET: 'MARKET'
});

const OrderStatus = Object.freeze({
  OPEN: 'OPEN',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'
});

const Role = Object.freeze({
  USER: 'user',
  ADMIN: 'admin'
});

module.exports = {
  Side,
  OrderType,
  OrderStatus,
  Role
};
