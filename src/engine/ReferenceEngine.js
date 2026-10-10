/**
 * ReferenceEngine.js
 * 
 * DELIBERATELY SIMPLE, OBVIOUSLY-CORRECT REFERENCE ORDER BOOK
 * 
 * WHY A REFERENCE ENGINE:
 * Complex data structures (Heaps + Doubly Linked Lists + HashMaps) can hide subtle edge-case bugs.
 * A Reference Engine uses plain JavaScript arrays and brute-force scans/sorts.
 * It is trivially easy to inspect and mathematically verify.
 * 
 * In differential stress testing, we feed the EXACT same pseudo-random order sequence
 * to both OrderBook and ReferenceEngine. If there is even a 1-paise or 1-unit mismatch
 * in any trade or book state, the stress test immediately catches it.
 */

const { Side, OrderType, OrderStatus } = require('./types');

class ReferenceEngine {
  constructor(symbol, tickSize = 5) {
    this.symbol = symbol.toUpperCase();
    this.tickSize = tickSize;
    this.bids = []; // Array of resting buy orders
    this.asks = []; // Array of resting sell orders
    this.sequence = 0;
    this.tradeSequence = 0;
    this.lastTradePrice = null;
  }

  processOrder(orderInput) {
    this.sequence += 1;
    const incoming = {
      orderId: String(orderInput.orderId),
      userId: String(orderInput.userId),
      symbol: this.symbol,
      side: orderInput.side,
      type: orderInput.type,
      price: orderInput.type === OrderType.LIMIT ? orderInput.price : null,
      originalQty: orderInput.quantity,
      filledQty: 0,
      remainingQty: orderInput.quantity,
      status: OrderStatus.OPEN,
      createdAt: orderInput.createdAt || Date.now(),
      sequence: this.sequence
    };

    const trades = [];
    let selfTradeCancelled = false;
    let cancelledQuantity = 0;

    // MARKET on empty opposite book -> REJECT
    if (incoming.type === OrderType.MARKET) {
      const oppositeEmpty = incoming.side === Side.BUY ? this.asks.length === 0 : this.bids.length === 0;
      if (oppositeEmpty) {
        incoming.status = OrderStatus.REJECTED;
        return {
          success: false,
          order: incoming,
          trades: [],
          cancelledQuantity: incoming.originalQty,
          selfTradeCancelled: false,
          reason: 'Market order rejected: opposite book is empty'
        };
      }
    }

    if (incoming.side === Side.BUY) {
      // Sort asks: Lowest price first. Tie-break: lowest sequence first (FIFO)
      this.asks.sort((a, b) => a.price - b.price || a.sequence - b.sequence);

      while (incoming.remainingQty > 0 && this.asks.length > 0) {
        const bestAsk = this.asks[0];

        if (incoming.type === OrderType.LIMIT && bestAsk.price > incoming.price) {
          break;
        }

        // Self-trade check
        if (bestAsk.userId === incoming.userId) {
          selfTradeCancelled = true;
          break;
        }

        const tradeQty = Math.min(incoming.remainingQty, bestAsk.remainingQty);
        const tradePrice = bestAsk.price; // Trade price is resting order price

        this.tradeSequence += 1;
        trades.push({
          tradeId: `REF-T-${this.symbol}-${this.tradeSequence}`,
          symbol: this.symbol,
          price: tradePrice,
          quantity: tradeQty,
          buyerId: incoming.userId,
          sellerId: bestAsk.userId,
          buyOrderId: incoming.orderId,
          sellOrderId: bestAsk.orderId,
          aggressorSide: Side.BUY,
          restingOrderId: bestAsk.orderId,
          timestamp: Date.now(),
          sequence: this.tradeSequence
        });

        this.lastTradePrice = tradePrice;
        incoming.remainingQty -= tradeQty;
        incoming.filledQty += tradeQty;
        bestAsk.remainingQty -= tradeQty;
        bestAsk.filledQty += tradeQty;

        if (bestAsk.remainingQty === 0) {
          bestAsk.status = OrderStatus.FILLED;
          this.asks.shift(); // Remove filled resting order
        } else {
          bestAsk.status = OrderStatus.PARTIALLY_FILLED;
        }
      }
    } else {
      // Incoming SELL
      // Sort bids: Highest price first. Tie-break: lowest sequence first (FIFO)
      this.bids.sort((a, b) => b.price - a.price || a.sequence - b.sequence);

      while (incoming.remainingQty > 0 && this.bids.length > 0) {
        const bestBid = this.bids[0];

        if (incoming.type === OrderType.LIMIT && bestBid.price < incoming.price) {
          break;
        }

        // Self-trade check
        if (bestBid.userId === incoming.userId) {
          selfTradeCancelled = true;
          break;
        }

        const tradeQty = Math.min(incoming.remainingQty, bestBid.remainingQty);
        const tradePrice = bestBid.price; // Resting order price

        this.tradeSequence += 1;
        trades.push({
          tradeId: `REF-T-${this.symbol}-${this.tradeSequence}`,
          symbol: this.symbol,
          price: tradePrice,
          quantity: tradeQty,
          buyerId: bestBid.userId,
          sellerId: incoming.userId,
          buyOrderId: bestBid.orderId,
          sellOrderId: incoming.orderId,
          aggressorSide: Side.SELL,
          restingOrderId: bestBid.orderId,
          timestamp: Date.now(),
          sequence: this.tradeSequence
        });

        this.lastTradePrice = tradePrice;
        incoming.remainingQty -= tradeQty;
        incoming.filledQty += tradeQty;
        bestBid.remainingQty -= tradeQty;
        bestBid.filledQty += tradeQty;

        if (bestBid.remainingQty === 0) {
          bestBid.status = OrderStatus.FILLED;
          this.bids.shift(); // Remove filled resting order
        } else {
          bestBid.status = OrderStatus.PARTIALLY_FILLED;
        }
      }
    }

    if (incoming.remainingQty === 0) {
      incoming.status = OrderStatus.FILLED;
    } else {
      if (selfTradeCancelled || incoming.type === OrderType.MARKET) {
        cancelledQuantity = incoming.remainingQty;
        incoming.remainingQty = 0;
        incoming.status = incoming.filledQty > 0 ? OrderStatus.PARTIALLY_FILLED : OrderStatus.CANCELLED;
      } else {
        incoming.status = incoming.filledQty > 0 ? OrderStatus.PARTIALLY_FILLED : OrderStatus.OPEN;
        if (incoming.side === Side.BUY) {
          this.bids.push(incoming);
        } else {
          this.asks.push(incoming);
        }
      }
    }

    return {
      success: true,
      order: incoming,
      trades,
      cancelledQuantity,
      selfTradeCancelled
    };
  }

  cancelOrder(orderId, userId = null) {
    const bidIdx = this.bids.findIndex(o => o.orderId === String(orderId));
    if (bidIdx !== -1) {
      const order = this.bids[bidIdx];
      if (userId && order.userId !== String(userId)) {
        throw new Error(`Unauthorized: User ${userId} does not own order ${orderId}`);
      }
      this.bids.splice(bidIdx, 1);
      const cancelledQuantity = order.remainingQty;
      order.remainingQty = 0;
      order.status = OrderStatus.CANCELLED;
      return { order, cancelledQuantity };
    }

    const askIdx = this.asks.findIndex(o => o.orderId === String(orderId));
    if (askIdx !== -1) {
      const order = this.asks[askIdx];
      if (userId && order.userId !== String(userId)) {
        throw new Error(`Unauthorized: User ${userId} does not own order ${orderId}`);
      }
      this.asks.splice(askIdx, 1);
      const cancelledQuantity = order.remainingQty;
      order.remainingQty = 0;
      order.status = OrderStatus.CANCELLED;
      return { order, cancelledQuantity };
    }

    throw new Error(`Order ${orderId} not found`);
  }

  getBestBid() {
    if (this.bids.length === 0) return null;
    this.bids.sort((a, b) => b.price - a.price || a.sequence - b.sequence);
    return this.bids[0].price;
  }

  getBestAsk() {
    if (this.asks.length === 0) return null;
    this.asks.sort((a, b) => a.price - b.price || a.sequence - b.sequence);
    return this.asks[0].price;
  }

  getSnapshot() {
    this.bids.sort((a, b) => b.price - a.price || a.sequence - b.sequence);
    this.asks.sort((a, b) => a.price - b.price || a.sequence - b.sequence);
    return {
      bids: this.bids.map(o => ({ orderId: o.orderId, price: o.price, remainingQty: o.remainingQty })),
      asks: this.asks.map(o => ({ orderId: o.orderId, price: o.price, remainingQty: o.remainingQty }))
    };
  }
}

module.exports = { ReferenceEngine };
