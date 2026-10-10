/**
 * tests/api.test.js
 * 
 * END-TO-END REST API INTEGRATION TESTS
 */

const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB, clearDB } = require('../src/db/connection');
const engineManager = require('../src/services/engineManager');
const User = require('../src/models/User');
const { Role, Side, OrderType } = require('../src/engine/types');

describe('Full REST API Integration Tests', () => {
  let userToken, adminToken, userId, adminId;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    await connectDB();
    await engineManager.init();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    engineManager.books.clear();
    engineManager.isInitialized = false;
    await engineManager.init();

    // Create user via signup endpoint
    const signupRes = await request(app)
      .post('/api/signup')
      .send({ email: 'trader1@test.local', password: 'password123' });
    userToken = signupRes.body.token;
    userId = signupRes.body.user._id;

    // Create admin directly in database (as signup only allows role user)
    const adminUser = await User.create({
      email: 'admin@test.local',
      passwordHash: 'dummyhash',
      role: Role.ADMIN,
      cash: { available: 1000000, locked: 0 }
    });
    adminId = adminUser._id;

    // Generate token for admin
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
    adminToken = jwt.sign(
      { userId: adminId, email: adminUser.email, role: Role.ADMIN },
      secret,
      { expiresIn: '1h' }
    );
  });

  test('POST /api/signup and POST /api/login', async () => {
    const loginRes = await request(app)
      .post('/api/login')
      .send({ email: 'trader1@test.local', password: 'password123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.user.email).toBe('trader1@test.local');
    expect(loginRes.body.user.passwordHash).toBeUndefined(); // Security: never return hash
  });

  test('GET /api/symbols lists active symbols', async () => {
    const res = await request(app).get('/api/symbols');
    expect(res.status).toBe(200);
    expect(res.body.symbols.length).toBeGreaterThanOrEqual(3);
    const symbols = res.body.symbols.map(s => s.symbol);
    expect(symbols).toContain('RELI');
  });

  test('POST /api/orders and GET /api/orderbook/:symbol', async () => {
    // Place a limit buy order for 5 units at Rs 95.00 (9500 paise)
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        symbol: 'RELI',
        side: Side.BUY,
        type: OrderType.LIMIT,
        price: 9500,
        quantity: 5
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.order.status).toBe('OPEN');
    expect(orderRes.body.order.remainingQty).toBe(5);

    // Verify order book contains the new level
    const bookRes = await request(app).get('/api/orderbook/RELI');
    expect(bookRes.status).toBe(200);
    expect(bookRes.body.bestBid).toBe(9500);
    expect(bookRes.body.bids[0].volume).toBe(5);
  });

  test('DELETE /api/orders/:id cancels order and releases funds', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        symbol: 'RELI',
        side: Side.BUY,
        type: OrderType.LIMIT,
        price: 9500,
        quantity: 5
      });

    const orderId = orderRes.body.order.orderId;

    const cancelRes = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.order.status).toBe('CANCELLED');

    // Order book should now be empty
    const bookRes = await request(app).get('/api/orderbook/RELI');
    expect(bookRes.body.bestBid).toBeNull();
  });

  test('GET /api/wallet returns cash and holdings', async () => {
    const res = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cash.available).toBeDefined();
    expect(res.body.holdings.RELI.available).toBeDefined();
  });

  test('GET /api/trades/my returns anonymized trade history', async () => {
    // Create second user
    const user2Res = await request(app)
      .post('/api/signup')
      .send({ email: 'trader2@test.local', password: 'password123' });
    const user2Token = user2Res.body.token;

    // User 1 sells 5 RELI at 10000
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ symbol: 'RELI', side: Side.SELL, type: OrderType.LIMIT, price: 10000, quantity: 5 });

    // User 2 buys 5 RELI at 10000 -> Match!
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ symbol: 'RELI', side: Side.BUY, type: OrderType.LIMIT, price: 10000, quantity: 5 });

    // User 1 inspects my trades
    const tradesRes = await request(app)
      .get('/api/trades/my')
      .set('Authorization', `Bearer ${userToken}`);

    expect(tradesRes.status).toBe(200);
    expect(tradesRes.body.trades.length).toBe(1);
    expect(tradesRes.body.trades[0].side).toBe('SELL');
    expect(tradesRes.body.trades[0].quantity).toBe(5);
    expect(tradesRes.body.trades[0].price).toBe(10000);
    expect(tradesRes.body.trades[0].total).toBe(50000);
    expect(tradesRes.body.trades[0].counterparty).toBeUndefined(); // Privacy: counterparty hidden!
  });

  test('Admin routes: stats, freeze/unfreeze, and circuit breaker', async () => {
    // 1. Get stats
    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.stats.totalUsers).toBeGreaterThanOrEqual(2);

    // 2. Freeze user
    const freezeRes = await request(app)
      .post(`/api/admin/users/${userId}/freeze`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(freezeRes.status).toBe(200);
    expect(freezeRes.body.user.isFrozen).toBe(true);

    // 3. Frozen user trying to place order is rejected
    const orderAttempt = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ symbol: 'RELI', side: Side.BUY, type: OrderType.LIMIT, price: 9000, quantity: 1 });
    expect(orderAttempt.status).toBe(403);

    // 4. Unfreeze user
    const unfreezeRes = await request(app)
      .post(`/api/admin/users/${userId}/unfreeze`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unfreezeRes.status).toBe(200);
    expect(unfreezeRes.body.user.isFrozen).toBe(false);

    // 5. Global Market Pause (Circuit breaker)
    const pauseRes = await request(app)
      .post('/api/admin/market/pause')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pauseRes.status).toBe(200);

    const pausedOrderAttempt = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ symbol: 'RELI', side: Side.BUY, type: OrderType.LIMIT, price: 9000, quantity: 1 });
    expect(pausedOrderAttempt.status).toBe(500);
    expect(pausedOrderAttempt.body.error).toMatch(/paused/i);

    // Resume market
    await request(app)
      .post('/api/admin/market/resume')
      .set('Authorization', `Bearer ${adminToken}`);
  });
});
