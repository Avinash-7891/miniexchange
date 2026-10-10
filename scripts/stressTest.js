/**
 * scripts/stressTest.js
 * 
 * RANDOMIZED DIFFERENTIAL STRESS TEST & INVARIANT VERIFICATION SUITE
 * 
 * In this test:
 * 1. A seeded deterministic Pseudo-Random Number Generator (Mulberry32) creates order sequences.
 * 2. The exact same order sequence is dispatched to:
 *    - The optimized `OrderBook` (Heaps + DoublyLinkedLists + HashMaps)
 *    - The brute-force `ReferenceEngine` (Arrays + Linear Scans + Slices)
 * 3. After every single order or cancellation:
 *    - Both engines must produce IDENTICAL trades (prices, quantities, buyerId, sellerId).
 *    - The OrderBook verifies strict structural invariants (no crossed book, FIFO preservation,
 *      no negative volumes, strict order map consistency).
 * 4. Runs across multiple seeds for 10,000+ orders, followed by a large 100,000+ order run.
 */

const { OrderBook } = require('../src/engine/OrderBook');
const { ReferenceEngine } = require('../src/engine/ReferenceEngine');
const { Side, OrderType } = require('../src/engine/types');

/**
 * Deterministic 32-bit PRNG (Mulberry32)
 */
function createRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run differential stress test for a given seed and order count
 */
function runStressTest(seed, orderCount, enableLogging = true) {
  if (enableLogging) {
    console.log(`\n======================================================`);
    console.log(`RUNNING STRESS TEST: Seed ${seed} | Orders: ${orderCount.toLocaleString()}`);
    console.log(`======================================================`);
  }

  const rng = createRng(seed);
  const symbol = 'RELI';
  const tickSize = 5;

  const realBook = new OrderBook(symbol, tickSize);
  const refBook = new ReferenceEngine(symbol, tickSize);

  // Pool of users to test self-trades and multi-counterparty matches
  const users = ['user_1', 'user_2', 'user_3', 'user_4', 'user_5', 'user_6', 'user_7', 'user_8'];
  const activeOrderIds = [];

  let totalTradesReal = 0;
  let totalTradesRef = 0;
  let totalVolumeReal = 0;
  let totalVolumeRef = 0;
  let totalCancels = 0;

  const startTime = Date.now();

  for (let i = 1; i <= orderCount; i++) {
    // 10% chance to cancel an existing open order if available
    if (activeOrderIds.length > 5 && rng() < 0.10) {
      const cancelIdx = Math.floor(rng() * activeOrderIds.length);
      const orderIdToCancel = activeOrderIds[cancelIdx];
      activeOrderIds.splice(cancelIdx, 1);

      let realCancelRes, refCancelRes;
      try {
        realCancelRes = realBook.cancelOrder(orderIdToCancel);
      } catch (e) {
        realCancelRes = null;
      }
      try {
        refCancelRes = refBook.cancelOrder(orderIdToCancel);
      } catch (e) {
        refCancelRes = null;
      }

      if ((realCancelRes === null) !== (refCancelRes === null)) {
        throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Cancel mismatch for orderId ${orderIdToCancel}: Real=${!!realCancelRes}, Ref=${!!refCancelRes}`);
      }

      if (realCancelRes && refCancelRes) {
        if (realCancelRes.cancelledQuantity !== refCancelRes.cancelledQuantity) {
          throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Cancelled quantity mismatch for ${orderIdToCancel}: Real=${realCancelRes.cancelledQuantity}, Ref=${refCancelRes.cancelledQuantity}`);
        }
        totalCancels++;
      }
      continue;
    }

    // Generate random order
    const orderId = `ORD-${seed}-${i}`;
    const user = users[Math.floor(rng() * users.length)];
    const side = rng() < 0.5 ? Side.BUY : Side.SELL;
    // 85% LIMIT, 15% MARKET
    const isMarket = rng() < 0.15;
    const type = isMarket ? OrderType.MARKET : OrderType.LIMIT;

    // Narrow price corridor (9800 to 10200 paise = Rs 98.00 to Rs 102.00) in steps of 5 paise
    // This guarantees dense overlap and frequent matching
    const priceTicks = Math.floor(rng() * 81); // 0 to 80 ticks
    const price = 9800 + priceTicks * tickSize;
    const quantity = Math.floor(rng() * 20) + 1; // 1 to 20 units

    const orderInput = {
      orderId,
      userId: user,
      symbol,
      side,
      type,
      price: isMarket ? null : price,
      quantity
    };

    // Process on both engines
    let realRes, refRes;
    try {
      realRes = realBook.processOrderSync(orderInput);
    } catch (err) {
      console.error(`Real engine failed at order #${i}:`, err);
      throw err;
    }

    try {
      refRes = refBook.processOrder(orderInput);
    } catch (err) {
      console.error(`Reference engine failed at order #${i}:`, err);
      throw err;
    }

    // Track active orders for random cancellation if resting
    if (realRes.order.remainingQty > 0) {
      activeOrderIds.push(orderId);
    }

    // DIFFERENTIAL CHECK 1: Success / Rejection status
    if (realRes.success !== refRes.success) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Success mismatch: Real=${realRes.success}, Ref=${refRes.success}`);
    }

    // DIFFERENTIAL CHECK 2: Order final status and quantities
    if (realRes.order.status !== refRes.order.status) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Status mismatch: Real=${realRes.order.status}, Ref=${refRes.order.status}`);
    }
    if (realRes.order.filledQty !== refRes.order.filledQty) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] FilledQty mismatch: Real=${realRes.order.filledQty}, Ref=${refRes.order.filledQty}`);
    }
    if (realRes.order.remainingQty !== refRes.order.remainingQty) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] RemainingQty mismatch: Real=${realRes.order.remainingQty}, Ref=${refRes.order.remainingQty}`);
    }
    if (realRes.cancelledQuantity !== refRes.cancelledQuantity) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] CancelledQty mismatch: Real=${realRes.cancelledQuantity}, Ref=${refRes.cancelledQuantity}`);
    }

    // DIFFERENTIAL CHECK 3: Trade counts and details
    if (realRes.trades.length !== refRes.trades.length) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Trade count mismatch: Real=${realRes.trades.length}, Ref=${refRes.trades.length}`);
    }

    for (let t = 0; t < realRes.trades.length; t++) {
      const tReal = realRes.trades[t];
      const tRef = refRes.trades[t];

      if (tReal.price !== tRef.price) {
        throw new Error(`[MISMATCH at order #${i}, Seed ${seed}, Trade #${t}] Trade Price: Real=${tReal.price}, Ref=${tRef.price}`);
      }
      if (tReal.quantity !== tRef.quantity) {
        throw new Error(`[MISMATCH at order #${i}, Seed ${seed}, Trade #${t}] Trade Qty: Real=${tReal.quantity}, Ref=${tRef.quantity}`);
      }
      if (tReal.buyerId !== tRef.buyerId || tReal.sellerId !== tRef.sellerId) {
        throw new Error(`[MISMATCH at order #${i}, Seed ${seed}, Trade #${t}] Counterparty mismatch: Real (${tReal.buyerId}, ${tReal.sellerId}) vs Ref (${tRef.buyerId}, ${tRef.sellerId})`);
      }
      if (tReal.buyOrderId !== tRef.buyOrderId || tReal.sellOrderId !== tRef.sellOrderId) {
        throw new Error(`[MISMATCH at order #${i}, Seed ${seed}, Trade #${t}] Order ID mismatch in trade`);
      }

      totalTradesReal++;
      totalTradesRef++;
      totalVolumeReal += tReal.quantity;
      totalVolumeRef += tRef.quantity;
    }

    // DIFFERENTIAL CHECK 4: Best Bid and Best Ask
    const realBestBid = realBook.getBestBid();
    const refBestBid = refBook.getBestBid();
    if (realBestBid !== refBestBid) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Best Bid: Real=${realBestBid}, Ref=${refBestBid}`);
    }

    const realBestAsk = realBook.getBestAsk();
    const refBestAsk = refBook.getBestAsk();
    if (realBestAsk !== refBestAsk) {
      throw new Error(`[MISMATCH at order #${i}, Seed ${seed}] Best Ask: Real=${realBestAsk}, Ref=${refBestAsk}`);
    }

    // STRICT INVARIANT CHECKS on real engine (assertInvariants inside realBook)
    realBook.assertInvariants();

    // Check progress periodically
    if (enableLogging && i % 25000 === 0) {
      console.log(`  Progress: ${i.toLocaleString()} / ${orderCount.toLocaleString()} orders processed... (Trades: ${totalTradesReal.toLocaleString()}, Volume: ${totalVolumeReal.toLocaleString()})`);
    }
  }

  // Final comparison of resting book states
  const refSnapshot = refBook.getSnapshot();
  const realDepth = realBook.getDepth(1000);

  let realTotalBidUnits = 0;
  for (const b of realDepth.bids) realTotalBidUnits += b.volume;
  let refTotalBidUnits = 0;
  for (const b of refSnapshot.bids) refTotalBidUnits += b.remainingQty;

  let realTotalAskUnits = 0;
  for (const a of realDepth.asks) realTotalAskUnits += a.volume;
  let refTotalAskUnits = 0;
  for (const a of refSnapshot.asks) refTotalAskUnits += a.remainingQty;

  if (realTotalBidUnits !== refTotalBidUnits) {
    throw new Error(`[FINAL BOOK MISMATCH, Seed ${seed}] Total Resting Bid Units: Real=${realTotalBidUnits}, Ref=${refTotalBidUnits}`);
  }
  if (realTotalAskUnits !== refTotalAskUnits) {
    throw new Error(`[FINAL BOOK MISMATCH, Seed ${seed}] Total Resting Ask Units: Real=${realTotalAskUnits}, Ref=${refTotalAskUnits}`);
  }

  const durationMs = Date.now() - startTime;
  const opsPerSec = Math.round((orderCount / durationMs) * 1000);

  if (enableLogging) {
    console.log(`PASSED: Seed ${seed} successfully matched ${orderCount.toLocaleString()} orders!`);
    console.log(`  - Trades executed: ${totalTradesReal.toLocaleString()}`);
    console.log(`  - Total units traded: ${totalVolumeReal.toLocaleString()}`);
    console.log(`  - Order cancellations: ${totalCancels.toLocaleString()}`);
    console.log(`  - Time taken: ${durationMs} ms (${opsPerSec.toLocaleString()} orders/sec)`);
    console.log(`  - Invariants: 100% verified (Best Bid < Best Ask, FIFO order preserved, 0 leaks)`);
  }

  return {
    seed,
    orderCount,
    durationMs,
    opsPerSec,
    totalTrades: totalTradesReal,
    totalVolume: totalVolumeReal,
    totalCancels
  };
}

/**
 * Main execution: Multiple 10k seeds + 1 large 100k seed
 */
function runAllStressTests() {
  console.log(`Starting MiniExchange Randomized Differential Stress Suite...`);
  const seeds = [101, 202, 303, 404, 505];
  const countPerSeed = 10000;

  for (const seed of seeds) {
    runStressTest(seed, countPerSeed, true);
  }

  console.log(`\n======================================================`);
  console.log(`RUNNING LARGE SCALE 100,000+ ORDER STRESS TEST`);
  console.log(`======================================================`);
  const largeResult = runStressTest(9999, 100000, true);

  console.log(`\n======================================================`);
  console.log(`ALL DIFFERENTIAL STRESS TESTS PASSED WITH ZERO MISMATCHES!`);
  console.log(`Total orders verified: ${(seeds.length * countPerSeed + 100000).toLocaleString()}`);
  console.log(`======================================================\n`);

  return largeResult;
}

if (require.main === module) {
  runAllStressTests();
}

module.exports = { runStressTest, runAllStressTests };
