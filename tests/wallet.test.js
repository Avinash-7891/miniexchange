/**
 * tests/wallet.test.js
 * 
 * WALLET, LEDGER & CONSERVATION INVARIANT TESTS
 */

const { connectDB, disconnectDB, clearDB } = require('../src/db/connection');
const User = require('../src/models/User');
const walletService = require('../src/services/walletService');
const { Side, OrderType } = require('../src/engine/types');

describe('Wallet and Ledger Conservation Tests', () => {
  let userA, userB;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    userA = await User.create({
      email: 'usera@test.local',
      passwordHash: 'dummyhash',
      cash: { available: 50000, locked: 0 }, // Rs 500.00
      holdings: {
        RELI: { available: 20, locked: 0 }
      }
    });

    userB = await User.create({
      email: 'userb@test.local',
      passwordHash: 'dummyhash',
      cash: { available: 50000, locked: 0 },
      holdings: {
        RELI: { available: 20, locked: 0 }
      }
    });
  });

  test('locking funds for BUY limit order: available decreases, locked increases', async () => {
    // 5 units at Rs 90.00 (9000 paise) = 45000 paise
    const lock = await walletService.lockForOrder(userA._id, {
      side: Side.BUY,
      type: OrderType.LIMIT,
      symbol: 'RELI',
      price: 9000,
      quantity: 5
    });

    expect(lock.lockedCash).toBe(45000);
    const updatedA = await User.findById(userA._id);
    expect(updatedA.cash.available).toBe(5000);
    expect(updatedA.cash.locked).toBe(45000);
  });

  test('locking fails when insufficient available cash', async () => {
    await expect(walletService.lockForOrder(userA._id, {
      side: Side.BUY,
      type: OrderType.LIMIT,
      symbol: 'RELI',
      price: 10000,
      quantity: 10 // needs 100,000 paise, only has 50,000
    })).rejects.toThrow(/insufficient/i);

    // Balances should be unchanged
    const updatedA = await User.findById(userA._id);
    expect(updatedA.cash.available).toBe(50000);
    expect(updatedA.cash.locked).toBe(0);
  });

  test('releasing locked funds on order cancellation', async () => {
    await walletService.lockForOrder(userA._id, {
      side: Side.BUY,
      type: OrderType.LIMIT,
      symbol: 'RELI',
      price: 9000,
      quantity: 5
    });

    await walletService.releaseLocked(
      userA._id,
      Side.BUY,
      OrderType.LIMIT,
      'RELI',
      9000,
      5 // cancelled all 5
    );

    const updatedA = await User.findById(userA._id);
    expect(updatedA.cash.available).toBe(50000);
    expect(updatedA.cash.locked).toBe(0);
  });

  test('trade settlement conserves total money and total assets with price improvement', async () => {
    const totalCashBefore = userA.cash.available + userB.cash.available;
    const totalUnitsBefore = userA.holdings.get('RELI').available + userB.holdings.get('RELI').available;

    // A places BUY LIMIT at 10000 for 5 units (locks 50000)
    await walletService.lockForOrder(userA._id, {
      side: Side.BUY,
      type: OrderType.LIMIT,
      symbol: 'RELI',
      price: 10000,
      quantity: 5
    });

    // B places SELL LIMIT at 9500 for 5 units (locks 5 units)
    await walletService.lockForOrder(userB._id, {
      side: Side.SELL,
      type: OrderType.LIMIT,
      symbol: 'RELI',
      price: 9500,
      quantity: 5
    });

    // Resting order was B at 9500, so trade price is 9500!
    // A gets price improvement refund of (10000 - 9500) * 5 = 2500 paise!
    const trade = {
      tradeId: 'T1',
      symbol: 'RELI',
      price: 9500,
      quantity: 5,
      buyerId: userA._id,
      sellerId: userB._id
    };

    await walletService.settleTrade(trade, OrderType.LIMIT, 10000);

    const finalA = await User.findById(userA._id);
    const finalB = await User.findById(userB._id);

    // A spent 9500 * 5 = 47500 paise. Original 50000 - 47500 = 2500 available, 0 locked.
    expect(finalA.cash.available).toBe(2500);
    expect(finalA.cash.locked).toBe(0);
    expect(finalA.holdings.get('RELI').available).toBe(25); // 20 + 5

    // B received 47500 paise. Original 50000 + 47500 = 97500 available, 0 locked.
    expect(finalB.cash.available).toBe(97500);
    expect(finalB.cash.locked).toBe(0);
    expect(finalB.holdings.get('RELI').available).toBe(15); // 20 - 5

    // DOUBLE-ENTRY CONSERVATION CHECK:
    const totalCashAfter = finalA.cash.available + finalB.cash.available;
    const totalUnitsAfter = finalA.holdings.get('RELI').available + finalB.holdings.get('RELI').available;

    expect(totalCashAfter).toBe(totalCashBefore);
    expect(totalUnitsAfter).toBe(totalUnitsBefore);
  });

  test('frozen user cannot place orders', async () => {
    await User.findByIdAndUpdate(userA._id, { isFrozen: true });

    await expect(walletService.lockForOrder(userA._id, {
      side: Side.BUY,
      type: OrderType.LIMIT,
      symbol: 'RELI',
      price: 1000,
      quantity: 1
    })).rejects.toThrow(/frozen/i);
  });
});
