/**
 * OrderBook.js
 * 
 * CORE MATCHING ENGINE FOR A SINGLE SYMBOL
 * 
 * ALGORITHM & ARCHITECTURE:
 * 1. Independent instance per symbol.
 * 2. Price-Time Priority (FIFO at each price level).
 * 3. Bid Side (BUY): MaxHeap of PriceLevels. Root = highest buy price (Best Bid).
 * 4. Ask Side (SELL): MinHeap of PriceLevels. Root = lowest sell price (Best Ask).
 * 5. Quick Price Lookup: HashMaps `bidLevels` and `askLevels` (price -> PriceLevel) for O(1) access.
 * 6. Order Tracking & O(1) Cancel: HashMap `orders` (orderId -> { node, level, side, order }).
 * 7. Resting Order Price Rule: All trades execute at the price of the RESTING order.
 * 8. Self-Trade Prevention: If an incoming order would trade against an order from the SAME user,
 *    matching stops immediately and the incoming order's remaining quantity is CANCELLED.
 * 9. Concurrency Guarantee: Single-threaded sequential processing queue per OrderBook.
 *    Orders for the same symbol never interleave.
 */

const { Side, OrderType, OrderStatus } = require('./types');
const { PriceLevel } = require('./PriceLevel');
const { MaxHeap, MinHeap } = require('./Heap');

class OrderBook {
  /**
   * @param {string} symbol - e.g. "RELI", "TCS", "INFY"
   * @param {number} tickSize - Minimum price increment in paise (default: 5 paise = Rs 0.05)
   */
  constructor(symbol, tickSize = 5) {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol must be a non-empty string');
    }
    this.symbol = symbol.toUpperCase();
    this.tickSize = tickSize; // in Paise

    // Data structures for bids (BUY)
    this.bids = new MaxHeap();
    this.bidLevels = new Map(); // price -> PriceLevel

    // Data structures for asks (SELL)
    this.asks = new MinHeap();
    this.askLevels = new Map(); // price -> PriceLevel

    // Fast order tracking for O(1) lookup & cancellation
    // orderId -> { node, level, side, order }
    this.orders = new Map();

    // Monotonic sequence counters for deterministic ordering & auditing
    this.sequence = 0;
    this.tradeSequence = 0;
    this.lastTradePrice = null; // in Paise

    // Concurrency queue: ensures strict serial execution per symbol
    this._queue = Promise.resolve();
  }

  /**
   * Validate order parameters before processing.
   * Throws an Error with a clear description if invalid.
   */
  _validateOrder(order) {
    if (!order) throw new Error('Order object is required');
    if (!order.orderId) throw new Error('Order orderId is required');
    if (!order.userId) throw new Error('Order userId is required');
    if (order.symbol !== this.symbol) {
      throw new Error(`Order symbol ${order.symbol} does not match book symbol ${this.symbol}`);
    }
    if (order.side !== Side.BUY && order.side !== Side.SELL) {
      throw new Error(`Invalid order side: ${order.side}. Must be BUY or SELL.`);
    }
    if (order.type !== OrderType.LIMIT && order.type !== OrderType.MARKET) {
      throw new Error(`Invalid order type: ${order.type}. Must be LIMIT or MARKET.`);
    }
    if (!Number.isInteger(order.quantity) || order.quantity <= 0) {
      throw new Error(`Quantity must be a positive integer, got: ${order.quantity}`);
    }

    if (order.type === OrderType.LIMIT) {
      if (!Number.isInteger(order.price) || order.price <= 0) {
        throw new Error(`LIMIT order price must be a positive integer (in paise), got: ${order.price}`);
      }
      if (order.price % this.tickSize !== 0) {
        throw new Error(`Price ${order.price} paise is not a valid tick size multiple (tick: ${this.tickSize} paise)`);
      }
    } else {
      // MARKET order
      order.price = null;
    }
  }

  /**
   * Enqueue order for serial execution.
   * Guarantees that concurrent calls for this symbol execute strictly one at a time.
   * @param {Object} order
   * @returns {Promise<Object>} Execution result
   */
  processOrder(order) {
    return new Promise((resolve, reject) => {
      this._queue = this._queue.then(() => {
        try {
          const result = this.processOrderSync(order);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Synchronous core matching engine execution.
   * @param {Object} orderInput 
   * @returns {Object} { success, order, trades, cancelledQuantity, selfTradeCancelled, bookEvents }
   */
  processOrderSync(orderInput) {
    this._validateOrder(orderInput);

    this.sequence += 1;
    const now = Date.now();

    // Standardize internal order object
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
      createdAt: orderInput.createdAt || now,
      sequence: this.sequence
    };

    const trades = [];
    let selfTradeCancelled = false;
    let cancelledQuantity = 0;

    // Handle MARKET order on empty opposite book -> REJECT immediately (Section 5.7)
    if (incoming.type === OrderType.MARKET) {
      const oppositeEmpty = incoming.side === Side.BUY ? this.asks.isEmpty() : this.bids.isEmpty();
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

    // MATCHING LOOP (Section 5.1 - 5.5)
    // Runs while incoming order still needs units and opposite book has liquidity
    if (incoming.side === Side.BUY) {
      // Incoming BUY matches against resting ASKS (lowest price first)
      while (incoming.remainingQty > 0 && !this.asks.isEmpty()) {
        const bestAskLevel = this.asks.peek();
        if (!bestAskLevel) break;

        // For LIMIT buy, stop if best ask price is higher than our limit price
        if (incoming.type === OrderType.LIMIT && bestAskLevel.price > incoming.price) {
          break;
        }

        // Match against orders at this price level in FIFO order
        while (incoming.remainingQty > 0 && !bestAskLevel.isEmpty()) {
          const restingOrder = bestAskLevel.peekFront();

          // Self-Trade Prevention (Section 5.9)
          // If incoming order would trade against same user's resting order,
          // STOP matching and cancel incoming order's remaining quantity.
          if (restingOrder.userId === incoming.userId) {
            selfTradeCancelled = true;
            break;
          }

          // Trade execution
          const tradeQty = Math.min(incoming.remainingQty, restingOrder.remainingQty);
          // Trade price is ALWAYS the resting order's price (Section 5.2)
          const tradePrice = bestAskLevel.price;

          this.tradeSequence += 1;
          const trade = {
            tradeId: `T-${this.symbol}-${this.tradeSequence}-${Date.now()}`,
            symbol: this.symbol,
            price: tradePrice, // in paise
            quantity: tradeQty,
            buyerId: incoming.userId,
            sellerId: restingOrder.userId,
            buyOrderId: incoming.orderId,
            sellOrderId: restingOrder.orderId,
            aggressorSide: Side.BUY,
            restingOrderId: restingOrder.orderId,
            timestamp: Date.now(),
            sequence: this.tradeSequence
          };

          trades.push(trade);
          this.lastTradePrice = tradePrice;

          // Update quantities
          incoming.remainingQty -= tradeQty;
          incoming.filledQty += tradeQty;
          restingOrder.remainingQty -= tradeQty;
          restingOrder.filledQty += tradeQty;
          bestAskLevel.orders.totalVolume -= tradeQty;

          // Handle resting order completion
          if (restingOrder.remainingQty === 0) {
            restingOrder.status = OrderStatus.FILLED;
            const node = bestAskLevel.orders.head;
            bestAskLevel.orders.removeNode(node);
            this.orders.delete(restingOrder.orderId);
          } else {
            restingOrder.status = OrderStatus.PARTIALLY_FILLED;
          }

          if (incoming.remainingQty === 0) {
            break;
          }
        }

        // If self-trade triggered, stop entire matching loop
        if (selfTradeCancelled) {
          break;
        }

        // If this ask price level was exhausted, clean it up from heap and map
        if (bestAskLevel.isEmpty()) {
          this.askLevels.delete(bestAskLevel.price);
          this.asks.remove(bestAskLevel);
        }
      }
    } else {
      // Incoming SELL matches against resting BIDS (highest price first)
      while (incoming.remainingQty > 0 && !this.bids.isEmpty()) {
        const bestBidLevel = this.bids.peek();
        if (!bestBidLevel) break;

        // For LIMIT sell, stop if best bid price is lower than our limit price
        if (incoming.type === OrderType.LIMIT && bestBidLevel.price < incoming.price) {
          break;
        }

        // Match against orders at this price level in FIFO order
        while (incoming.remainingQty > 0 && !bestBidLevel.isEmpty()) {
          const restingOrder = bestBidLevel.peekFront();

          // Self-Trade Prevention (Section 5.9)
          if (restingOrder.userId === incoming.userId) {
            selfTradeCancelled = true;
            break;
          }

          // Trade execution
          const tradeQty = Math.min(incoming.remainingQty, restingOrder.remainingQty);
          // Trade price is ALWAYS the resting order's price (Section 5.2)
          const tradePrice = bestBidLevel.price;

          this.tradeSequence += 1;
          const trade = {
            tradeId: `T-${this.symbol}-${this.tradeSequence}-${Date.now()}`,
            symbol: this.symbol,
            price: tradePrice, // in paise
            quantity: tradeQty,
            buyerId: restingOrder.userId,
            sellerId: incoming.userId,
            buyOrderId: restingOrder.orderId,
            sellOrderId: incoming.orderId,
            aggressorSide: Side.SELL,
            restingOrderId: restingOrder.orderId,
            timestamp: Date.now(),
            sequence: this.tradeSequence
          };

          trades.push(trade);
          this.lastTradePrice = tradePrice;

          // Update quantities
          incoming.remainingQty -= tradeQty;
          incoming.filledQty += tradeQty;
          restingOrder.remainingQty -= tradeQty;
          restingOrder.filledQty += tradeQty;
          bestBidLevel.orders.totalVolume -= tradeQty;

          // Handle resting order completion
          if (restingOrder.remainingQty === 0) {
            restingOrder.status = OrderStatus.FILLED;
            const node = bestBidLevel.orders.head;
            bestBidLevel.orders.removeNode(node);
            this.orders.delete(restingOrder.orderId);
          } else {
            restingOrder.status = OrderStatus.PARTIALLY_FILLED;
          }

          if (incoming.remainingQty === 0) {
            break;
          }
        }

        // If self-trade triggered, stop entire matching loop
        if (selfTradeCancelled) {
          break;
        }

        // If this bid price level was exhausted, clean it up from heap and map
        if (bestBidLevel.isEmpty()) {
          this.bidLevels.delete(bestBidLevel.price);
          this.bids.remove(bestBidLevel);
        }
      }
    }

    // POST-MATCHING RESOLUTION FOR INCOMING ORDER
    if (incoming.remainingQty === 0) {
      incoming.status = OrderStatus.FILLED;
    } else {
      // Unfilled remainder exists
      if (selfTradeCancelled) {
        // Self-trade policy: cancel remaining quantity
        cancelledQuantity = incoming.remainingQty;
        incoming.remainingQty = 0;
        incoming.status = incoming.filledQty > 0 ? OrderStatus.PARTIALLY_FILLED : OrderStatus.CANCELLED;
      } else if (incoming.type === OrderType.MARKET) {
        // Section 5.7: Market order unfilled remainder is CANCELLED and NEVER rests in the book
        cancelledQuantity = incoming.remainingQty;
        incoming.remainingQty = 0;
        incoming.status = incoming.filledQty > 0 ? OrderStatus.PARTIALLY_FILLED : OrderStatus.CANCELLED;
      } else {
        // LIMIT order with remainder: rests in the book (Section 5.6)
        incoming.status = incoming.filledQty > 0 ? OrderStatus.PARTIALLY_FILLED : OrderStatus.OPEN;
        this._insertRestingOrder(incoming);
      }
    }

    // Verify invariant after every single order execution (Section 5.11)
    this.assertInvariants();

    return {
      success: true,
      order: incoming,
      trades,
      cancelledQuantity,
      selfTradeCancelled
    };
  }

  /**
   * Insert an unfilled limit order into the resting order book.
   * Time Complexity: O(log p) to insert price level if new, plus O(1) to append order to DLL.
   * @param {Object} order 
   */
  _insertRestingOrder(order) {
    const isBid = order.side === Side.BUY;
    const levelsMap = isBid ? this.bidLevels : this.askLevels;
    const heap = isBid ? this.bids : this.asks;

    let level = levelsMap.get(order.price);
    if (!level) {
      level = new PriceLevel(order.price);
      levelsMap.set(order.price, level);
      heap.push(level); // O(log p)
    }

    const node = level.addOrder(order); // O(1)
    this.orders.set(order.orderId, {
      node,
      level,
      side: order.side,
      order
    });
  }

  /**
   * Cancel an open or partially filled resting order in O(1) + O(log p).
   * @param {string} orderId 
   * @param {string} [userId] - Optional validation of order ownership
   * @returns {Object} cancelled order details
   */
  cancelOrder(orderId, userId = null) {
    const tracked = this.orders.get(String(orderId));
    if (!tracked) {
      throw new Error(`Order ${orderId} not found or already completed/cancelled`);
    }

    const { node, level, side, order } = tracked;

    if (userId && order.userId !== String(userId)) {
      throw new Error(`Unauthorized: User ${userId} does not own order ${orderId}`);
    }

    const cancelledQuantity = order.remainingQty;

    // Remove from price level DoublyLinkedList in O(1) FIRST while remainingQty is still intact
    level.removeOrderNode(node);
    this.orders.delete(String(orderId));

    order.remainingQty = 0;
    order.status = OrderStatus.CANCELLED;

    // If level is now empty, remove from heap and map in O(log p)
    if (level.isEmpty()) {
      if (side === Side.BUY) {
        this.bidLevels.delete(level.price);
        this.bids.remove(level);
      } else {
        this.askLevels.delete(level.price);
        this.asks.remove(level);
      }
    }

    this.assertInvariants();

    return {
      order,
      cancelledQuantity
    };
  }

  /**
   * Returns current Best Bid price in paise, or null if no bids.
   */
  getBestBid() {
    const top = this.bids.peek();
    return top ? top.price : null;
  }

  /**
   * Returns current Best Ask price in paise, or null if no asks.
   */
  getBestAsk() {
    const top = this.asks.peek();
    return top ? top.price : null;
  }

  /**
   * Spread = best ask minus best bid (in paise), or null if either side is empty.
   */
  getSpread() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (bestBid === null || bestAsk === null) return null;
    return bestAsk - bestBid;
  }

  /**
   * Get an order by ID. O(1)
   */
  getOrder(orderId) {
    const tracked = this.orders.get(String(orderId));
    return tracked ? tracked.order : null;
  }

  /**
   * Export order book depth snapshot up to maxDepth levels per side.
   * @param {number} maxDepth 
   */
  getDepth(maxDepth = 20) {
    const sortedBids = this.bids.getSortedLevels().slice(0, maxDepth);
    const sortedAsks = this.asks.getSortedLevels().slice(0, maxDepth);

    return {
      symbol: this.symbol,
      tickSize: this.tickSize,
      lastTradePrice: this.lastTradePrice,
      bestBid: this.getBestBid(),
      bestAsk: this.getBestAsk(),
      spread: this.getSpread(),
      bids: sortedBids.map(l => ({
        price: l.price,
        volume: l.totalVolume,
        orderCount: l.orderCount
      })),
      asks: sortedAsks.map(l => ({
        price: l.price,
        volume: l.totalVolume,
        orderCount: l.orderCount
      }))
    };
  }

  /**
   * Verify all core mathematical and structural invariants.
   * Section 5.11 & Section 14.3
   */
  assertInvariants() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    // Invariant 1: Book is never crossed (bestBid < bestAsk)
    if (bestBid !== null && bestAsk !== null && bestBid >= bestAsk) {
      throw new Error(`CRITICAL INVARIANT VIOLATION: Crossed Book! Best Bid ${bestBid} >= Best Ask ${bestAsk}`);
    }

    // Invariant 2: No empty price levels in maps
    for (const [price, level] of this.bidLevels) {
      if (level.isEmpty()) {
        throw new Error(`INVARIANT VIOLATION: Empty bid price level ${price} remained in bidLevels map`);
      }
      if (level.price !== price) {
        throw new Error(`INVARIANT VIOLATION: Bid level key ${price} does not match level.price ${level.price}`);
      }
    }
    for (const [price, level] of this.askLevels) {
      if (level.isEmpty()) {
        throw new Error(`INVARIANT VIOLATION: Empty ask price level ${price} remained in askLevels map`);
      }
      if (level.price !== price) {
        throw new Error(`INVARIANT VIOLATION: Ask level key ${price} does not match level.price ${level.price}`);
      }
    }

    // Invariant 3: Order tracking map count equals sum of orders across all levels
    let totalLevelOrders = 0;
    for (const level of this.bidLevels.values()) totalLevelOrders += level.orderCount;
    for (const level of this.askLevels.values()) totalLevelOrders += level.orderCount;

    if (this.orders.size !== totalLevelOrders) {
      throw new Error(`INVARIANT VIOLATION: Tracking orders map size (${this.orders.size}) does not match book order count (${totalLevelOrders})`);
    }

    return true;
  }
}

module.exports = { OrderBook };
