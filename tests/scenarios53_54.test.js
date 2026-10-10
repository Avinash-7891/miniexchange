/**
 * tests/scenarios53_54.test.js
 * 
 * Tests covering the exact mandated scenarios from:
 *   Section 5.3 (Buyer matching multiple resting sellers with 3 price cases)
 *   Section 5.4 (Seller matching multiple resting buyers at best price)
 */

const { OrderBook } = require('../src/engine/OrderBook');
const { Side, OrderType, OrderStatus } = require('../src/engine/types');

describe('Mandated Section 5.3 Scenarios: Buyer A with Sellers B and C', () => {
  // Common setup for 5.3:
  // B sells 3 units at pb. C sells 2 units at pc.
  // A wants to BUY 5 units at max price pa.

  test('Section 5.3 Case 1: pa >= pb and pa >= pc (Trades both, cheaper one first)', () => {
    const book = new OrderBook('RELI', 5);
    // B sells 3 units at pb = 10000 (Rs 100.00)
    book.processOrderSync({
      orderId: 'B',
      userId: 'user_B',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 3
    });

    // C sells 2 units at pc = 9500 (Rs 95.00) -> pc < pb, so C is cheaper!
    book.processOrderSync({
      orderId: 'C',
      userId: 'user_C',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 9500,
      quantity: 2
    });

    // A wants to BUY 5 units at max price pa = 10500 (Rs 105.00)
    // Here pa >= pb (10500 >= 10000) and pa >= pc (10500 >= 9500)
    const result = book.processOrderSync({
      orderId: 'A',
      userId: 'user_A',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10500,
      quantity: 5
    });

    expect(result.order.status).toBe(OrderStatus.FILLED);
    expect(result.trades).toHaveLength(2);

    // Rule: Cheaper one goes first! (pc < pb => C goes first)
    expect(result.trades[0].sellOrderId).toBe('C');
    expect(result.trades[0].sellerId).toBe('user_C');
    expect(result.trades[0].quantity).toBe(2);
    expect(result.trades[0].price).toBe(9500); // executed at resting price pc

    // Then B goes second for 3 units
    expect(result.trades[1].sellOrderId).toBe('B');
    expect(result.trades[1].sellerId).toBe('user_B');
    expect(result.trades[1].quantity).toBe(3);
    expect(result.trades[1].price).toBe(10000); // executed at resting price pb

    // Both books should now be completely empty
    expect(book.getBestAsk()).toBeNull();
    expect(book.getBestBid()).toBeNull();
  });

  test('Section 5.3 Case 2: pa >= pb but pa < pc (Trades 3 with B only, remaining 2 rest at pa)', () => {
    const book = new OrderBook('RELI', 5);
    // B sells 3 units at pb = 9500 (Rs 95.00)
    book.processOrderSync({
      orderId: 'B',
      userId: 'user_B',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 9500,
      quantity: 3
    });

    // C sells 2 units at pc = 11000 (Rs 110.00)
    book.processOrderSync({
      orderId: 'C',
      userId: 'user_C',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 11000,
      quantity: 2
    });

    // A wants to BUY 5 units at max price pa = 10000 (Rs 100.00)
    // pa >= pb (10000 >= 9500) but pa < pc (10000 < 11000)
    const result = book.processOrderSync({
      orderId: 'A',
      userId: 'user_A',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    });

    expect(result.order.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(result.order.filledQty).toBe(3);
    expect(result.order.remainingQty).toBe(2);

    // Only traded 3 units with B
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].sellOrderId).toBe('B');
    expect(result.trades[0].quantity).toBe(3);
    expect(result.trades[0].price).toBe(9500);

    // Remaining 2 units of A must rest in the bid side at pa (10000)
    expect(book.getBestBid()).toBe(10000);
    const restingA = book.getOrder('A');
    expect(restingA).toBeDefined();
    expect(restingA.remainingQty).toBe(2);
    expect(restingA.price).toBe(10000);

    // C must still be resting in ask side at pc (11000)
    expect(book.getBestAsk()).toBe(11000);
    const restingC = book.getOrder('C');
    expect(restingC.remainingQty).toBe(2);
  });

  test('Section 5.3 Case 3: Neither matches (All 5 units rest in book at pa)', () => {
    const book = new OrderBook('RELI', 5);
    // B sells 3 units at pb = 11000
    book.processOrderSync({
      orderId: 'B',
      userId: 'user_B',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 11000,
      quantity: 3
    });

    // C sells 2 units at pc = 12000
    book.processOrderSync({
      orderId: 'C',
      userId: 'user_C',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 12000,
      quantity: 2
    });

    // A wants to BUY 5 units at max price pa = 10000
    // Neither pb nor pc <= pa
    const result = book.processOrderSync({
      orderId: 'A',
      userId: 'user_A',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 10000,
      quantity: 5
    });

    expect(result.order.status).toBe(OrderStatus.OPEN);
    expect(result.order.filledQty).toBe(0);
    expect(result.order.remainingQty).toBe(5);
    expect(result.trades).toHaveLength(0);

    // All 5 units rest in the bid book
    expect(book.getBestBid()).toBe(10000);
    expect(book.getBestAsk()).toBe(11000);
    expect(book.getOrder('A').remainingQty).toBe(5);
  });
});

describe('Mandated Section 5.4 Scenarios: Seller with Buyers B and C', () => {
  test('Section 5.4: Seller wants to SELL 5 units at min 50. B bids 90 for 2, C bids 95 for 3', () => {
    const book = new OrderBook('RELI', 5);

    // B bids 90.00 (9000 paise) for 2 units
    book.processOrderSync({
      orderId: 'B',
      userId: 'user_B',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9000,
      quantity: 2
    });

    // C bids 95.00 (9500 paise) for 3 units
    book.processOrderSync({
      orderId: 'C',
      userId: 'user_C',
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9500,
      quantity: 3
    });

    // Seller wants to SELL 5 units at minimum price of 50.00 (5000 paise)
    const result = book.processOrderSync({
      orderId: 'S',
      userId: 'user_S',
      symbol: 'RELI',
      side: Side.SELL,
      type: OrderType.LIMIT,
      price: 5000,
      quantity: 5
    });

    expect(result.order.status).toBe(OrderStatus.FILLED);
    expect(result.trades).toHaveLength(2);

    // Rule: Seller matches the highest bidder FIRST!
    // 3 units to C at 95.00 (9500 paise)
    expect(result.trades[0].buyOrderId).toBe('C');
    expect(result.trades[0].buyerId).toBe('user_C');
    expect(result.trades[0].quantity).toBe(3);
    expect(result.trades[0].price).toBe(9500); // Seller receives buyer's price!

    // Then 2 units to B at 90.00 (9000 paise)
    expect(result.trades[1].buyOrderId).toBe('B');
    expect(result.trades[1].buyerId).toBe('user_B');
    expect(result.trades[1].quantity).toBe(2);
    expect(result.trades[1].price).toBe(9000); // Seller receives buyer's price!

    // Bid book is now empty, ask book is empty
    expect(book.getBestBid()).toBeNull();
    expect(book.getBestAsk()).toBeNull();
  });
});
