/**
 * services/engineManager.js
 * 
 * MULTI-SYMBOL MATCHING ENGINE MANAGER & CONCURRENCY ORCHESTRATOR
 * 
 * Responsibilities:
 * 1. Maintains independent `OrderBook` instances per symbol.
 * 2. Enforces serial, atomic execution per symbol (no interleaving).
 * 3. Bridges in-memory engine with MongoDB persistence and atomic wallet updates.
 * 4. Crash Recovery: Rebuilds order books on startup from database open/partially filled orders.
 * 5. Dispatches real-time WebSocket events for depth, trades, and private updates.
 */

const { OrderBook } = require('../engine/OrderBook');
const { Side, OrderType, OrderStatus } = require('../engine/types');
const Symbol = require('../models/Symbol');
const Order = require('../models/Order');
const Trade = require('../models/Trade');
const User = require('../models/User');
const MarketState = require('../models/MarketState');
const walletService = require('./walletService');
const wsService = require('./wsService');

class EngineManager {
  constructor() {
    this.books = new Map(); // symbol -> OrderBook
    this.isInitialized = false;
  }

  /**
   * Initialize all active symbols and recover pending orders from DB.
   */
  async init() {
    if (this.isInitialized) return;

    // Fetch active symbols
    let symbols = await Symbol.find({ isActive: true });
    if (symbols.length === 0) {
      // Seed default symbols if database is empty
      const defaultSymbols = [
        { symbol: 'RELI', name: 'Reliance Industries', tickSize: 5 },
        { symbol: 'TCS', name: 'Tata Consultancy Services', tickSize: 5 },
        { symbol: 'INFY', name: 'Infosys Ltd', tickSize: 5 }
      ];
      symbols = await Symbol.insertMany(defaultSymbols);
    }

    for (const sym of symbols) {
      this.books.set(sym.symbol.toUpperCase(), new OrderBook(sym.symbol, sym.tickSize));
    }

    // CRASH RECOVERY: Replay all OPEN and PARTIALLY_FILLED orders from DB
    console.log('Rebuilding in-memory order books from persistent storage...');
    const pendingOrders = await Order.find({
      status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] }
    }).sort({ sequence: 1, createdAt: 1 });

    let restoredCount = 0;
    for (const ord of pendingOrders) {
      const book = this.books.get(ord.symbol.toUpperCase());
      if (book) {
        book._insertRestingOrder({
          orderId: ord.orderId,
          userId: ord.userId.toString(),
          symbol: ord.symbol,
          side: ord.side,
          type: ord.type,
          price: ord.price,
          originalQty: ord.originalQty,
          filledQty: ord.filledQty,
          remainingQty: ord.remainingQty,
          status: ord.status,
          createdAt: new Date(ord.createdAt).getTime(),
          sequence: ord.sequence || 0
        });
        restoredCount++;
      }
    }

    console.log(`Order book recovery complete. Restored ${restoredCount} resting orders across ${this.books.size} symbols.`);
    this.isInitialized = true;
  }

  /**
   * Retrieve OrderBook for a symbol, creating dynamically if registered in DB.
   */
  getBook(symbol) {
    return this.books.get(symbol.toUpperCase());
  }

  /**
   * Register a new symbol dynamically into the engine.
   */
  registerSymbol(symbol, tickSize = 5) {
    const sym = symbol.toUpperCase();
    if (!this.books.has(sym)) {
      this.books.set(sym, new OrderBook(sym, tickSize));
    }
    return this.books.get(sym);
  }

  /**
   * Check if trading is halted globally or for a specific symbol.
   */
  async isMarketPaused(symbol) {
    const globalState = await MarketState.findOne({ key: 'global_state' });
    if (globalState && globalState.isGlobalPaused) {
      return true;
    }
    const symDoc = await Symbol.findOne({ symbol: symbol.toUpperCase() });
    if (!symDoc || !symDoc.isActive || symDoc.isPaused) {
      return true;
    }
    return false;
  }

  /**
   * Submit an order for execution through the serial queue.
   */
  async submitOrder(userId, { symbol, side, type, price, quantity }) {
    const sym = symbol.toUpperCase();
    const book = this.getBook(sym);
    if (!book) {
      throw new Error(`Symbol ${sym} not supported or not active`);
    }

    // 1. Check circuit breaker / market pause
    const paused = await this.isMarketPaused(sym);
    if (paused) {
      throw new Error(`Market for ${sym} is currently paused or inactive`);
    }

    // 2. Check if user is frozen
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.isFrozen) throw new Error('User account is frozen by administrator');

    // 3. Basic validation
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('Quantity must be a positive integer');
    }
    if (type === OrderType.LIMIT) {
      if (!price || price <= 0 || !Number.isInteger(price)) {
        throw new Error('LIMIT order price must be a positive integer in paise');
      }
      if (price % book.tickSize !== 0) {
        throw new Error(`Price ${price} must be a multiple of tick size (${book.tickSize} paise)`);
      }
    }

    // 4. Atomic Lock of funds/holdings
    const lockInfo = await walletService.lockForOrder(userId, {
      side,
      type,
      symbol: sym,
      price: type === OrderType.LIMIT ? price : null,
      quantity
    });

    // 5. Generate Order ID & Persist Initial Order in Database
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const orderDoc = await Order.create({
      orderId,
      userId,
      symbol: sym,
      side,
      type,
      price: type === OrderType.LIMIT ? price : null,
      originalQty: quantity,
      remainingQty: quantity,
      filledQty: 0,
      status: OrderStatus.OPEN
    });

    // 6. Execute Order through the Engine's serial queue for this symbol
    let result;
    try {
      result = await book.processOrder({
        orderId,
        userId: String(userId),
        symbol: sym,
        side,
        type,
        price: type === OrderType.LIMIT ? price : null,
        quantity,
        createdAt: orderDoc.createdAt.getTime()
      });
    } catch (engineErr) {
      // If engine rejected or failed, release locked funds and update status
      await walletService.releaseLocked(
        userId,
        side,
        type,
        sym,
        price,
        quantity,
        lockInfo.lockedCash
      );
      await Order.findByIdAndUpdate(orderDoc._id, { status: OrderStatus.REJECTED });
      throw engineErr;
    }

    // If order was rejected by engine (e.g. market order on empty book)
    if (!result.success) {
      await walletService.releaseLocked(
        userId,
        side,
        type,
        sym,
        price,
        quantity,
        lockInfo.lockedCash
      );
      await Order.findByIdAndUpdate(orderDoc._id, { status: OrderStatus.REJECTED });
      return {
        order: result.order,
        trades: [],
        reason: result.reason
      };
    }

    // 7. Process & Settle all generated trades
    const savedTrades = [];
    for (const t of result.trades) {
      // Save trade in MongoDB
      const tradeDoc = await Trade.create({
        tradeId: t.tradeId,
        symbol: t.symbol,
        price: t.price,
        quantity: t.quantity,
        buyerId: t.buyerId,
        sellerId: t.sellerId,
        buyOrderId: t.buyOrderId,
        sellOrderId: t.sellOrderId,
        aggressorSide: t.aggressorSide,
        timestamp: new Date(t.timestamp)
      });
      savedTrades.push(tradeDoc);

      // Find resting order to know its limit price for rebate calculation
      const restingOrderDoc = await Order.findOne({ orderId: t.restingOrderId });
      const restingPrice = restingOrderDoc ? restingOrderDoc.price : t.price;

      // Settle balances between buyer and seller in wallet
      const isBuyerIncoming = side === Side.BUY;
      const buyerOrderType = isBuyerIncoming ? type : restingOrderDoc.type;
      const buyerLimitPrice = isBuyerIncoming ? price : restingPrice;

      await walletService.settleTrade(
        t,
        buyerOrderType,
        buyerLimitPrice,
        lockInfo.lockedCash
      );

      // Update resting order in MongoDB
      if (restingOrderDoc) {
        restingOrderDoc.filledQty += t.quantity;
        restingOrderDoc.remainingQty -= t.quantity;
        restingOrderDoc.status = restingOrderDoc.remainingQty === 0
          ? OrderStatus.FILLED
          : OrderStatus.PARTIALLY_FILLED;
        await restingOrderDoc.save();

        // WebSocket notify resting user
        wsService.sendUserOrderUpdate(restingOrderDoc.userId, restingOrderDoc);
        const restingUser = await User.findById(restingOrderDoc.userId);
        if (restingUser) wsService.sendUserWalletUpdate(restingOrderDoc.userId, restingUser);
      }

      // Broadcast trade execution to public tape
      wsService.broadcastTrade(sym, t);
    }

    // 8. Update incoming order status in MongoDB
    orderDoc.filledQty = result.order.filledQty;
    orderDoc.remainingQty = result.order.remainingQty;
    orderDoc.status = result.order.status;
    orderDoc.sequence = result.order.sequence;
    await orderDoc.save();

    // 9. If unfilled quantity was cancelled (market remainder or self-trade), release locked funds
    if (result.cancelledQuantity > 0) {
      await walletService.releaseLocked(
        userId,
        side,
        type,
        sym,
        price,
        result.cancelledQuantity,
        lockInfo.lockedCash - (result.order.filledQty * (result.trades[0]?.price || 0))
      );
    }

    // 10. WebSocket notifications for incoming user
    wsService.sendUserOrderUpdate(userId, orderDoc);
    const updatedUser = await User.findById(userId);
    if (updatedUser) wsService.sendUserWalletUpdate(userId, updatedUser);

    // 11. Broadcast updated orderbook depth to public WebSocket channel
    const depth = book.getDepth();
    wsService.broadcastOrderBook(sym, depth);

    return {
      order: orderDoc,
      trades: savedTrades,
      bookDepth: depth
    };
  }

  /**
   * Cancel an open order.
   */
  async cancelOrder(orderId, userId, isAdmin = false) {
    const orderDoc = await Order.findOne({ orderId });
    if (!orderDoc) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (!isAdmin && orderDoc.userId.toString() !== String(userId)) {
      throw new Error(`Unauthorized: User does not own order ${orderId}`);
    }

    if (orderDoc.status === OrderStatus.FILLED || orderDoc.status === OrderStatus.CANCELLED) {
      throw new Error(`Cannot cancel order with status ${orderDoc.status}`);
    }

    const book = this.getBook(orderDoc.symbol);
    if (!book) {
      throw new Error(`Order book for ${orderDoc.symbol} not found`);
    }

    // Remove from in-memory engine
    const cancelRes = book.cancelOrder(orderId, isAdmin ? null : userId);

    // Update in database
    orderDoc.status = OrderStatus.CANCELLED;
    orderDoc.remainingQty = 0;
    await orderDoc.save();

    // Release locked funds back to user
    await walletService.releaseLocked(
      orderDoc.userId,
      orderDoc.side,
      orderDoc.type,
      orderDoc.symbol,
      orderDoc.price,
      cancelRes.cancelledQuantity
    );

    // WebSocket updates
    wsService.sendUserOrderUpdate(orderDoc.userId, orderDoc);
    const updatedUser = await User.findById(orderDoc.userId);
    if (updatedUser) wsService.sendUserWalletUpdate(orderDoc.userId, updatedUser);

    const depth = book.getDepth();
    wsService.broadcastOrderBook(orderDoc.symbol, depth);

    return orderDoc;
  }
}

module.exports = new EngineManager();
