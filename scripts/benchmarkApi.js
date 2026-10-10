/**
 * scripts/benchmarkApi.js
 * 
 * HTTP REST API BENCHMARK (AUTOCANNON)
 * 
 * Measures real full-stack API throughput and latency,
 * including Express router, JWT authentication, MongoDB queries, and JSON serialization.
 */

const os = require('os');
const http = require('http');
const autocannon = require('autocannon');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { connectDB, disconnectDB, clearDB } = require('../src/db/connection');
const engineManager = require('../src/services/engineManager');
const User = require('../src/models/User');
const { Role, Side, OrderType } = require('../src/engine/types');

async function runApiBenchmark() {
  console.log(`=================================================================`);
  console.log(`MINIEXCHANGE HTTP REST API BENCHMARK (AUTOCANNON)`);
  console.log(`=================================================================`);

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown';
  console.log(`System Information:`);
  console.log(`  - CPU: ${cpuModel} (${cpus.length} logical cores)`);
  console.log(`  - Node.js: ${process.version}`);
  console.log(`  - OS: ${os.type()} ${os.release()} (${os.arch()})\n`);

  process.env.USE_MEMORY_DB = 'true';
  await connectDB();
  await clearDB();
  await engineManager.init();

  // Create benchmark user with large funds
  const user = await User.create({
    email: 'benchuser@test.local',
    passwordHash: 'dummy',
    role: Role.USER,
    cash: { available: 1000000000, locked: 0 },
    holdings: {
      RELI: { available: 1000000, locked: 0 }
    }
  });

  const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
  const token = jwt.sign(
    { userId: user._id, email: user.email, role: Role.USER },
    secret,
    { expiresIn: '1h' }
  );

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Temporary test server running on port ${port}...`);

  // BENCHMARK 1: GET /api/orderbook/RELI (High-frequency Market Data Read)
  console.log(`\n--- BENCHMARK 1: GET /api/orderbook/RELI (Read Throughput) ---`);
  const readResult = await autocannon({
    url: `${baseUrl}/api/orderbook/RELI`,
    connections: 10,
    duration: 5,
    pipelining: 1
  });

  // BENCHMARK 2: POST /api/orders (Full Write Pipeline: Auth + Lock + Match + DB + Log)
  console.log(`\n--- BENCHMARK 2: POST /api/orders (Full Write & Match Pipeline) ---`);
  const writeResult = await autocannon({
    url: `${baseUrl}/api/orders`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      symbol: 'RELI',
      side: Side.BUY,
      type: OrderType.LIMIT,
      price: 9500,
      quantity: 1
    }),
    connections: 10,
    duration: 5,
    pipelining: 1
  });

  // Print results table
  console.log(`\n=================================================================`);
  console.log(`MEASURED API BENCHMARK RESULTS`);
  console.log(`=================================================================`);
  console.log(`Endpoint                   | Req / sec | Avg Latency (ms) | p99 Latency (ms)`);
  console.log(`---------------------------|-----------|------------------|------------------`);
  console.log(`GET  /api/orderbook/RELI   | ${String(readResult.requests.average).padStart(9)} | ${String(readResult.latency.average).padStart(16)} | ${String(readResult.latency.p99).padStart(16)}`);
  console.log(`POST /api/orders           | ${String(writeResult.requests.average).padStart(9)} | ${String(writeResult.latency.average).padStart(16)} | ${String(writeResult.latency.p99).padStart(16)}`);
  console.log(`=================================================================\n`);

  server.close();
  await new Promise(resolve => setTimeout(resolve, 500));
  await disconnectDB();

  return {
    read: {
      reqPerSec: readResult.requests.average,
      avgLatencyMs: readResult.latency.average,
      p99LatencyMs: readResult.latency.p99
    },
    write: {
      reqPerSec: writeResult.requests.average,
      avgLatencyMs: writeResult.latency.average,
      p99LatencyMs: writeResult.latency.p99
    }
  };
}

if (require.main === module) {
  runApiBenchmark().then(() => process.exit(0)).catch((err) => {
    console.error('API benchmark error:', err);
    process.exit(1);
  });
}

module.exports = { runApiBenchmark };
