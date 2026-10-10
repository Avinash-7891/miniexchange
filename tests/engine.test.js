const { OrderBook } = require('../src/engine/OrderBook');
const { Side, OrderType, OrderStatus } = require('../src/engine/types');

describe('OrderBook Core Engine Unit Tests', () => {
  let book;

  beforeEach(() => {
    book = new OrderBook('RELI', 5);
  });

  test('simple match between buy and sell of equal quantity', () => {
    // Resting SELL: 10 units at Rs 100.00 (10000 paise)
    const sellOrder = {
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 10
    };
    const sellRes = book.processOrderSync(sellOrder);
    expect(sellRes.order.status).toBe(OrderStatus.OPEN);
    expect(book.getBestAsk()).toBe(10000);

    // Incoming BUY: 10 units at Rs 100.00 (10000 paise)
    const buyOrder = {
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 10
    };
    const buyRes = book.processOrderSync(buyOrder);
    expect(buyRes.order.status).toBe(OrderStatus.FILLED);
    expect(buyRes.trades).toHaveLength(1);
    expect(buyRes.trades[0].quantity).toBe(10);
    expect(buyRes.trades[0].price).toBe(10000);
    expect(book.getBestAsk()).toBeNull();
    expect(book.getBestBid()).toBeNull();
  });

  test('no match: order rests in the book when prices do not cross', () => {
    // Buyer bids 90.00 (9000 paise), Seller asks 100.00 (10000 paise)
    const buyOrder = {
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9000,
      quantity: 10
    };
    const buyRes = book.processOrderSync(buyOrder);
    expect(buyRes.order.status).toBe(OrderStatus.OPEN);
    expect(buyRes.trades).toHaveLength(0);
    expect(book.getBestBid()).toBe(9000);

    const sellOrder = {
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    };
    const sellRes = book.processOrderSync(sellOrder);
    expect(sellRes.order.status).toBe(OrderStatus.OPEN);
    expect(sellRes.trades).toHaveLength(0);
    expect(book.getBestAsk()).toBe(10000);
    expect(book.getSpread()).toBe(1000); // 10000 - 9000 = 1000 paise (Rs 10.00)
  });

  test('partial fill: incoming order larger than resting order', () => {
    book.processOrderSync({
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 4
    });

    // Incoming BUY for 10 units at 10000
    const buyRes = book.processOrderSync({
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 10
    });

    expect(buyRes.order.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(buyRes.order.filledQty).toBe(4);
    expect(buyRes.order.remainingQty).toBe(6);
    expect(buyRes.trades).toHaveLength(1);
    expect(buyRes.trades[0].quantity).toBe(4);
    // Remaining 6 units should now rest as best bid
    expect(book.getBestBid()).toBe(10000);
    expect(book.getBestAsk()).toBeNull();
  });

  test('same-price FIFO fairness: earlier order matched first', () => {
    // Seller 1 places at 100.00 (older)
    book.processOrderSync({
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    });
    // Seller 2 places at 100.00 (newer)
    book.processOrderSync({
      orderId: 'S2',
      userId: 'seller2',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    });

    // Buyer places buy for 7 units at 100.00
    const buyRes = book.processOrderSync({
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 7
    });

    expect(buyRes.trades).toHaveLength(2);
    // First trade must be with Seller 1 for all 5 units
    expect(buyRes.trades[0].sellOrderId).toBe('S1');
    expect(buyRes.trades[0].quantity).toBe(5);
    // Second trade must be with Seller 2 for remaining 2 units
    expect(buyRes.trades[1].sellOrderId).toBe('S2');
    expect(buyRes.trades[1].quantity).toBe(2);

    // S2 should still have 3 units resting in the book
    const s2Order = book.getOrder('S2');
    expect(s2Order.remainingQty).toBe(3);
    expect(s2Order.status).toBe(OrderStatus.PARTIALLY_FILLED);
  });

  test('best price first: buyer takes the cheapest ask first', () => {
    book.processOrderSync({
      orderId: 'S_EXPENSIVE',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10500,
      quantity: 5
    });
    book.processOrderSync({
      orderId: 'S_CHEAP',
      userId: 'seller2',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    });

    const buyRes = book.processOrderSync({
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 11000,
      quantity: 3
    });

    expect(buyRes.trades).toHaveLength(1);
    expect(buyRes.trades[0].sellOrderId).toBe('S_CHEAP');
    expect(buyRes.trades[0].price).toBe(10000);
  });

  test('best price first: seller takes the highest bid first', () => {
    book.processOrderSync({
      orderId: 'B_LOW',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9000,
      quantity: 5
    });
    book.processOrderSync({
      orderId: 'B_HIGH',
      userId: 'buyer2',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9500,
      quantity: 5
    });

    const sellRes = book.processOrderSync({
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 8500,
      quantity: 3
    });

    expect(sellRes.trades).toHaveLength(1);
    expect(sellRes.trades[0].buyOrderId).toBe('B_HIGH');
    expect(sellRes.trades[0].price).toBe(9500);
  });

  test('trade price equals the RESTING order price (price improvement)', () => {
    // Resting ask at 95.00
    book.processOrderSync({
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 9500,
      quantity: 10
    });

    // Incoming buy with willingness to pay 105.00
    const buyRes = book.processOrderSync({
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10500,
      quantity: 5
    });

    expect(buyRes.trades[0].price).toBe(9500); // executed at resting price of 9500!
  });

  test('multi-level sweep with different trade prices', () => {
    book.processOrderSync({
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 3
    });
    book.processOrderSync({
      orderId: 'S2',
      userId: 'seller2',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10200,
      quantity: 4
    });

    // Sweeping buy of 6 units at limit 10500
    const buyRes = book.processOrderSync({
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10500,
      quantity: 6
    });

    expect(buyRes.trades).toHaveLength(2);
    expect(buyRes.trades[0].price).toBe(10000);
    expect(buyRes.trades[0].quantity).toBe(3);
    expect(buyRes.trades[1].price).toBe(10200);
    expect(buyRes.trades[1].quantity).toBe(3);
    expect(book.getOrder('S2').remainingQty).toBe(1);
  });

  test('cancellation of resting order removes it cleanly from book', () => {
    book.processOrderSync({
      orderId: 'B1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9000,
      quantity: 10
    });
    expect(book.getBestBid()).toBe(9000);

    const cancelRes = book.cancelOrder('B1', 'buyer1');
    expect(cancelRes.order.status).toBe(OrderStatus.CANCELLED);
    expect(cancelRes.cancelledQuantity).toBe(10);
    expect(book.getBestBid()).toBeNull();
    expect(book.getOrder('B1')).toBeNull();

    // Trying to cancel again throws error
    expect(() => book.cancelOrder('B1')).toThrow();
  });

  test('market order with not enough quantity cancels unfilled remainder', () => {
    // Only 4 units available at 10000
    book.processOrderSync({
      orderId: 'S1',
      userId: 'seller1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 4
    });

    // Market buy for 10 units
    const marketBuy = book.processOrderSync({
      orderId: 'M1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.MARKET,
      quantity: 10
    });

    expect(marketBuy.order.filledQty).toBe(4);
    expect(marketBuy.order.remainingQty).toBe(0);
    expect(marketBuy.cancelledQuantity).toBe(6);
    expect(marketBuy.order.status).toBe(OrderStatus.PARTIALLY_FILLED);
    // Unfilled remainder must NEVER rest in the book
    expect(book.getBestBid()).toBeNull();
  });

  test('market order on an empty book is rejected', () => {
    const marketBuy = book.processOrderSync({
      orderId: 'M1',
      userId: 'buyer1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.MARKET,
      quantity: 5
    });

    expect(marketBuy.success).toBe(false);
    expect(marketBuy.order.status).toBe(OrderStatus.REJECTED);
    expect(marketBuy.reason).toMatch(/empty/i);
  });

  test('self-trade prevention stops matching and cancels remaining quantity', () => {
    // User1 places sell order for 10 units at 10000
    book.processOrderSync({
      orderId: 'S1',
      userId: 'user1',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 10
    });

    // Same User1 places buy order for 5 units at 10000
    const buyRes = book.processOrderSync({
      orderId: 'B1',
      userId: 'user1',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    });

    expect(buyRes.selfTradeCancelled).toBe(true);
    expect(buyRes.trades).toHaveLength(0); // No trade permitted!
    expect(buyRes.order.status).toBe(OrderStatus.CANCELLED);
    expect(buyRes.cancelledQuantity).toBe(5);

    // Resting sell order remains intact
    const restingSell = book.getOrder('S1');
    expect(restingSell.remainingQty).toBe(10);
  });

  test('validation rejects invalid inputs with clear messages', () => {
    expect(() => book.processOrderSync({
      orderId: 'X',
      userId: 'u',
      symbol: 'RELI',
      side: 'INVALID',
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    })).toThrow(/side/i);

    expect(() => book.processOrderSync({
      orderId: 'X',
      userId: 'u',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: -50,
      quantity: 5
    })).toThrow(/price/i);

    expect(() => book.processOrderSync({
      orderId: 'X',
      userId: 'u',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10003, // Not multiple of tickSize 5
      quantity: 5
    })).toThrow(/tick size/i);

    expect(() => book.processOrderSync({
      orderId: 'X',
      userId: 'u',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 0
    })).toThrow(/quantity/i);
  });
});
