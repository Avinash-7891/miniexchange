/**
 * scripts/seed.js
 * 
 * INITIAL SEED DATA SCRIPT
 * 
 * Populates:
 * 1. Admin account (cannot be created via signup).
 * 2. Demo trading accounts (Alice, Bob, Charlie) with fake cash and stock holdings.
 * 3. Tradable symbols (RELI, TCS, INFY).
 * 4. Realistic initial trade history for charts.
 * 5. Non-overlapping resting limit orders placed through the standard order pipeline,
 *    ensuring real wallet fund locking and non-empty books on launch.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB } = require('../src/db/connection');
const User = require('../src/models/User');
const Symbol = require('../src/models/Symbol');
const Order = require('../src/models/Order');
const Trade = require('../src/models/Trade');
const MarketState = require('../src/models/MarketState');
const engineManager = require('../src/services/engineManager');
const { Role, Side, OrderType } = require('../src/engine/types');

async function seed() {
  console.log('Connecting to database for seeding...');
  await connectDB();

  console.log('Clearing old database records...');
  await User.deleteMany({});
  await Symbol.deleteMany({});
  await Order.deleteMany({});
  await Trade.deleteMany({});
  await MarketState.deleteMany({});

  // Reset in-memory engine manager
  engineManager.books.clear();
  engineManager.isInitialized = false;

  console.log('Seeding symbols...');
  const symbols = await Symbol.insertMany([
    { symbol: 'RELI', name: 'Reliance Industries', tickSize: 5, isActive: true },
    { symbol: 'TCS', name: 'Tata Consultancy Services', tickSize: 5, isActive: true },
    { symbol: 'INFY', name: 'Infosys Limited', tickSize: 5, isActive: true }
  ]);

  console.log('Seeding global market circuit breaker state...');
  await MarketState.create({ key: 'global_state', isGlobalPaused: false });

  // Initialize engine manager with symbols
  await engineManager.init();

  console.log('Creating Admin & Demo Users...');
  const salt = await bcrypt.genSalt(10);
  const adminPass = await bcrypt.hash('admin123', salt);
  const alicePass = await bcrypt.hash('alice123', salt);
  const bobPass = await bcrypt.hash('bob123', salt);
  const charliePass = await bcrypt.hash('charlie123', salt);

  const admin = await User.create({
    email: 'admin@miniexchange.local',
    passwordHash: adminPass,
    role: Role.ADMIN,
    cash: { available: 50000000, locked: 0 }, // Rs 5,00,000.00
    holdings: {
      RELI: { available: 1000, locked: 0 },
      TCS: { available: 1000, locked: 0 },
      INFY: { available: 1000, locked: 0 }
    }
  });

  const alice = await User.create({
    email: 'alice@miniexchange.local',
    passwordHash: alicePass,
    role: Role.USER,
    cash: { available: 10000000, locked: 0 }, // Rs 1,00,000.00
    holdings: {
      RELI: { available: 200, locked: 0 },
      TCS: { available: 150, locked: 0 },
      INFY: { available: 250, locked: 0 }
    }
  });

  const bob = await User.create({
    email: 'bob@miniexchange.local',
    passwordHash: bobPass,
    role: Role.USER,
    cash: { available: 10000000, locked: 0 }, // Rs 1,00,000.00
    holdings: {
      RELI: { available: 200, locked: 0 },
      TCS: { available: 150, locked: 0 },
      INFY: { available: 250, locked: 0 }
    }
  });

  const charlie = await User.create({
    email: 'charlie@miniexchange.local',
    passwordHash: charliePass,
    role: Role.USER,
    cash: { available: 10000000, locked: 0 }, // Rs 1,00,000.00
    holdings: {
      RELI: { available: 200, locked: 0 },
      TCS: { available: 150, locked: 0 },
      INFY: { available: 250, locked: 0 }
    }
  });

  console.log('Generating initial demo trades to populate charts and trade tape...');
  // 1. Initial trade on RELI at Rs 100.00 (10000 paise)
  await engineManager.submitOrder(alice._id, {
    symbol: 'RELI',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 10000,
    quantity: 10
  });
  await engineManager.submitOrder(bob._id, {
    symbol: 'RELI',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 10000,
    quantity: 10
  });

  // 2. Initial trade on TCS at Rs 200.00 (20000 paise)
  await engineManager.submitOrder(bob._id, {
    symbol: 'TCS',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 20000,
    quantity: 8
  });
  await engineManager.submitOrder(charlie._id, {
    symbol: 'TCS',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 20000,
    quantity: 8
  });

  // 3. Initial trade on INFY at Rs 150.00 (15000 paise)
  await engineManager.submitOrder(charlie._id, {
    symbol: 'INFY',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 15000,
    quantity: 12
  });
  await engineManager.submitOrder(alice._id, {
    symbol: 'INFY',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 15000,
    quantity: 12
  });

  console.log('Placing non-overlapping resting orders across all symbols...');
  // Placed through normal flow so wallet cash/units locking is authentic

  // RELI Orders (Best Bid: Rs 98.00, Best Ask: Rs 102.00)
  // ASKS (Resting Sells)
  await engineManager.submitOrder(alice._id, {
    symbol: 'RELI',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 10200, // Rs 102.00
    quantity: 15
  });
  await engineManager.submitOrder(bob._id, {
    symbol: 'RELI',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 10400, // Rs 104.00
    quantity: 20
  });
  await engineManager.submitOrder(charlie._id, {
    symbol: 'RELI',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 10650, // Rs 106.50
    quantity: 25
  });
  // BIDS (Resting Buys)
  await engineManager.submitOrder(bob._id, {
    symbol: 'RELI',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 9800, // Rs 98.00
    quantity: 12
  });
  await engineManager.submitOrder(charlie._id, {
    symbol: 'RELI',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 9600, // Rs 96.00
    quantity: 18
  });
  await engineManager.submitOrder(alice._id, {
    symbol: 'RELI',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 9400, // Rs 94.00
    quantity: 25
  });

  // TCS Orders (Best Bid: Rs 195.00, Best Ask: Rs 205.00)
  await engineManager.submitOrder(alice._id, {
    symbol: 'TCS',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 20500,
    quantity: 10
  });
  await engineManager.submitOrder(bob._id, {
    symbol: 'TCS',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 21000,
    quantity: 15
  });
  await engineManager.submitOrder(bob._id, {
    symbol: 'TCS',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 19500,
    quantity: 10
  });
  await engineManager.submitOrder(charlie._id, {
    symbol: 'TCS',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 19000,
    quantity: 15
  });

  // INFY Orders (Best Bid: Rs 146.00, Best Ask: Rs 154.00)
  await engineManager.submitOrder(charlie._id, {
    symbol: 'INFY',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 15400,
    quantity: 14
  });
  await engineManager.submitOrder(alice._id, {
    symbol: 'INFY',
    side: Side.SELL,
    type: OrderType.LIMIT,
    price: 15800,
    quantity: 20
  });
  await engineManager.submitOrder(bob._id, {
    symbol: 'INFY',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 14600,
    quantity: 15
  });
  await engineManager.submitOrder(alice._id, {
    symbol: 'INFY',
    side: Side.BUY,
    type: OrderType.LIMIT,
    price: 14200,
    quantity: 20
  });

  console.log('\n======================================================');
  console.log('SEEDING COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  console.log('DEMO ACCOUNTS READY FOR LOGIN:\n');
  console.log('1. Admin Account:');
  console.log('   Email:    admin@miniexchange.local');
  console.log('   Password: admin123');
  console.log('   Role:     admin\n');
  console.log('2. Demo Trader 1:');
  console.log('   Email:    alice@miniexchange.local');
  console.log('   Password: alice123');
  console.log('   Role:     user\n');
  console.log('3. Demo Trader 2:');
  console.log('   Email:    bob@miniexchange.local');
  console.log('   Password: bob123');
  console.log('   Role:     user\n');
  console.log('4. Demo Trader 3:');
  console.log('   Email:    charlie@miniexchange.local');
  console.log('   Password: charlie123');
  console.log('   Role:     user\n');
  console.log('Symbols Seeded: RELI, TCS, INFY');
  console.log('Order books populated with realistic, non-crossing resting bids & asks.');
  console.log('======================================================\n');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
