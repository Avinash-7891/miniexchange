/**
 * scripts/benchmarkEngine.js
 * 
 * PURE ENGINE MICRO-BENCHMARK
 * 
 * Measures:
 * 1. Throughput: Orders per second (ops/sec).
 * 2. Latency: p50 (median), p95, p99 per-order latency in microseconds (µs).
 * 3. Repetition: 5 independent runs of 100,000 orders each, reporting median.
 * 4. Scaling: Performance as order book depth grows (0-25k, 25k-50k, 50k-75k, 75k-100k).
 * 5. Environment: Node.js version, CPU model, Architecture, OS.
 */

const os = require('os');
const { OrderBook } = require('../src/engine/OrderBook');
const { Side, OrderType } = require('../src/engine/types');

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
 * Pre-generate orders into memory so generation overhead is excluded from benchmark.
 */
function pregenerateOrders(count = 100000, seed = 42) {
  const rng = createRng(seed);
  const orders = [];
  const users = ['alice', 'bob', 'charlie', 'david', 'emma', 'frank', 'grace', 'helen'];
  const tickSize = 5;

  for (let i = 1; i <= count; i++) {
    const isMarket = rng() < 0.15;
    const priceTicks = Math.floor(rng() * 101); // 0 to 100 ticks
    const price = 9750 + priceTicks * tickSize; // Rs 97.50 to Rs 102.50
    const quantity = Math.floor(rng() * 15) + 1;
    const side = rng() < 0.5 ? Side.BUY : Side.SELL;

    orders.push({
      orderId: `BENCH-${i}`,
      userId: users[Math.floor(rng() * users.length)],
      symbol: 'RELI',
      side,
      type: isMarket ? OrderType.MARKET : OrderType.LIMIT,
      price: isMarket ? null : price,
      quantity
    });
  }
  return orders;
}

function runIteration(iterationIndex, orders) {
  const book = new OrderBook('RELI', 5);
  const count = orders.length;
  const latenciesNs = new BigInt64Array(count); // Store nanoseconds

  // Phase breakdown for depth scaling
  const phaseLatencies = {
    '0 - 25k': [],
    '25k - 50k': [],
    '50k - 75k': [],
    '75k - 100k': []
  };

  const startTotalNs = process.hrtime.bigint();

  for (let i = 0; i < count; i++) {
    const t0 = process.hrtime.bigint();
    book.processOrderSync(orders[i]);
    const t1 = process.hrtime.bigint();
    const diff = t1 - t0;
    latenciesNs[i] = diff;

    // Track phase latency in microseconds
    const diffUs = Number(diff) / 1000;
    if (i < 25000) phaseLatencies['0 - 25k'].push(diffUs);
    else if (i < 50000) phaseLatencies['25k - 50k'].push(diffUs);
    else if (i < 75000) phaseLatencies['50k - 75k'].push(diffUs);
    else phaseLatencies['75k - 100k'].push(diffUs);
  }

  const endTotalNs = process.hrtime.bigint();
  const totalDurationMs = Number(endTotalNs - startTotalNs) / 1_000_000;
  const ordersPerSec = Math.round((count / totalDurationMs) * 1000);

  // Convert latencies to microseconds and sort for percentiles
  const latenciesUs = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    latenciesUs[i] = Number(latenciesNs[i]) / 1000;
  }
  latenciesUs.sort();

  const p50 = latenciesUs[Math.floor(count * 0.50)];
  const p95 = latenciesUs[Math.floor(count * 0.95)];
  const p99 = latenciesUs[Math.floor(count * 0.99)];
  const max = latenciesUs[count - 1];

  return {
    iteration: iterationIndex,
    totalDurationMs: Math.round(totalDurationMs),
    ordersPerSec,
    p50: parseFloat(p50.toFixed(2)),
    p95: parseFloat(p95.toFixed(2)),
    p99: parseFloat(p99.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
    phaseLatencies
  };
}

function calculatePhaseStats(arr) {
  arr.sort((a, b) => a - b);
  const n = arr.length;
  return {
    p50: parseFloat(arr[Math.floor(n * 0.5)].toFixed(2)),
    p95: parseFloat(arr[Math.floor(n * 0.95)].toFixed(2)),
    p99: parseFloat(arr[Math.floor(n * 0.99)].toFixed(2))
  };
}

function runBenchmark() {
  console.log(`=================================================================`);
  console.log(`MINIEXCHANGE PURE ENGINE BENCHMARK (100,000 ORDERS x 5 RUNS)`);
  console.log(`=================================================================`);

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown';
  console.log(`System Information:`);
  console.log(`  - CPU: ${cpuModel} (${cpus.length} logical cores)`);
  console.log(`  - OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`  - Node.js: ${process.version}`);
  console.log(`  - Memory: ${(os.totalmem() / (1024 ** 3)).toFixed(1)} GB`);
  console.log(`\nPre-generating 100,000 deterministic orders...`);

  const orders = pregenerateOrders(100000, 42);
  console.log(`Orders generated. Executing 5 iterations...\n`);

  const results = [];
  let samplePhases = null;

  for (let r = 1; r <= 5; r++) {
    const res = runIteration(r, orders);
    results.push(res);
    if (r === 3) samplePhases = res.phaseLatencies; // representative run for depth scaling
    console.log(`Run ${r}/5: ${res.ordersPerSec.toLocaleString()} ops/sec | Duration: ${res.totalDurationMs} ms | p50: ${res.p50} µs | p95: ${res.p95} µs | p99: ${res.p99} µs`);
  }

  // Calculate Median across the 5 runs
  const sortedByOps = [...results].sort((a, b) => a.ordersPerSec - b.ordersPerSec);
  const medianResult = sortedByOps[2]; // Middle of 5

  console.log(`\n=================================================================`);
  console.log(`MEDIAN BENCHMARK RESULT (Across 5 Independent Runs)`);
  console.log(`=================================================================`);
  console.log(`Throughput:  ${medianResult.ordersPerSec.toLocaleString()} orders / sec`);
  console.log(`Total Time:  ${medianResult.totalDurationMs} ms (for 100,000 orders)`);
  console.log(`p50 Latency: ${medianResult.p50} µs (0.00${Math.round(medianResult.p50)} ms)`);
  console.log(`p95 Latency: ${medianResult.p95} µs`);
  console.log(`p99 Latency: ${medianResult.p99} µs`);

  console.log(`\nBook Depth Scaling Analysis (Latency vs Book Growth):`);
  console.log(`-----------------------------------------------------------------`);
  console.log(`Order Range   | p50 (µs) | p95 (µs) | p99 (µs)`);
  console.log(`-----------------------------------------------------------------`);
  for (const [phase, arr] of Object.entries(samplePhases)) {
    const stats = calculatePhaseStats(arr);
    console.log(`${phase.padEnd(13)} | ${String(stats.p50).padStart(8)} | ${String(stats.p95).padStart(8)} | ${String(stats.p99).padStart(8)}`);
  }
  console.log(`-----------------------------------------------------------------\n`);

  return {
    environment: {
      cpu: cpuModel,
      cores: cpus.length,
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version
    },
    runs: results,
    median: medianResult,
    phaseScaling: samplePhases
  };
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark };
