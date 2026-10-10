# MiniExchange: High-Performance Order Matching Engine & Simulated Stock Exchange

MiniExchange is an end-to-end simulated stock-exchange order matching engine built from scratch. It models the core architectural components of modern financial exchanges (such as NSE, NASDAQ, and CME): a deterministic Limit Order Book (LOB) matching engine, an atomic double-entry wallet and ledger service, real-time WebSocket depth feeds, persistent MongoDB audit logging, an administrative circuit breaker, and a plain, functional trading user interface.

**Note on Financial Safety:** All currency and market data in this project are strictly simulated and fake. Money is tracked as integer Paise (1 INR = 100 paise) to eliminate IEEE 754 floating-point inaccuracies.

---

## 1. System Architecture

```
                             +-------------------------+
                             |   React Web Frontend    |
                             | (Vite, Plain HTML/CSS)  |
                             +------------+------------+
                                          |
                        HTTP REST API     |     WebSocket Feed
                      (/api/orders, etc)  |    (/ws: Depth, Trades)
                                          v
+---------------------------------------------------------------------------------+
|                                 Node.js Backend Server                          |
|                                                                                 |
|  +--------------------+   +---------------------+   +-------------------------+ |
|  | Express Routers    |   | Wallet & Ledger     |   | WebSocket Broadcaster   | |
|  | - Auth (JWT/Bcrypt)|   | - Double-Entry      |   | - Top 20 Depth Books    | |
|  | - Trading API      |   | - Atomic Locks      |   | - Trade Execution Tape  | |
|  | - Admin Panel      |   | - Price Rebates     |   | - Private User Events   | |
|  +---------+----------+   +----------+----------+   +------------+------------+ |
|            |                         |                           ^              |
|            +-------------------------+                           |              |
|                                      v                           |              |
|                    +-----------------------------------+         |              |
|                    |     Engine Manager Orchestrator   |---------+              |
|                    |  - Sequential Queue per Symbol    |                        |
|                    |  - Crash Recovery Replay          |                        |
|                    +-----------------+-----------------+                        |
+--------------------------------------|------------------------------------------+
                                       |
                   In-Memory Dispatches| (Strictly 1-at-a-time per symbol)
                                       v
+---------------------------------------------------------------------------------+
|                        Pure In-Memory Matching Engine                           |
|                     (Zero external database/network deps)                       |
|                                                                                 |
|   BIDS (BUY SIDE)                                      ASKS (SELL SIDE)         |
|   MaxHeap of PriceLevels                               MinHeap of PriceLevels   |
|   Best Bid = Root O(1)                                 Best Ask = Root O(1)     |
|          |                                                    |                 |
|          v                                                    v                 |
|   DoublyLinkedList (FIFO)                              DoublyLinkedList (FIFO)  |
|   [Order 1] <-> [Order 2]                              [Order 1] <-> [Order 2]  |
|                                                                                 |
|   Order Map: HashMap<orderId, OrderNode> (O(1) Cancellation and Lookup)         |
+---------------------------------------------------------------------------------+
                                       |
                         Asynchronous / Synced Persistence
                                       v
+---------------------------------------------------------------------------------+
|                                 MongoDB Database                                |
|  - Users (Cash & Stock holdings)       - Orders (State & remaining quantities)  |
|  - Symbols (Tick size & active flags)  - Trades (Immutable execution audit log) |
+---------------------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
miniExchangeProject/
├── package.json               # Root dependencies & test/benchmark scripts
├── docker-compose.yml         # Optional MongoDB container runner
├── .env.example               # Environment template
├── README.md                  # Comprehensive technical documentation (English)
├── CODE_WALKTHROUGH.md        # Beginner-friendly conceptual walkthrough (Hinglish)
├── src/
│   ├── engine/                # Standalone Pure Algorithmic Engine (No DB/Web deps)
│   │   ├── types.js           # Enums: Side, OrderType, OrderStatus, Role
│   │   ├── DoublyLinkedList.js# O(1) FIFO queue and arbitrary node removal
│   │   ├── Heap.js            # Custom BinaryHeap (MaxHeap for Bids, MinHeap for Asks)
│   │   ├── PriceLevel.js      # Aggregated liquidity level container
│   │   ├── OrderBook.js       # Core LOB with Price-Time priority & self-trade check
│   │   └── ReferenceEngine.js # Brute-force reference engine for differential testing
│   ├── models/                # Mongoose Schema Models
│   │   ├── User.js            # User entity with cash and stock holdings ledger
│   │   ├── Symbol.js          # Tradable instruments (RELI, TCS, INFY)
│   │   ├── Order.js           # Persistent order records with indexing
│   │   ├── Trade.js           # Immutable trade audit log
│   │   └── MarketState.js     # Circuit breaker global state
│   ├── services/              # Application Business Logic
│   │   ├── walletService.js   # Atomic conditional locks, double-entry settlement
│   │   ├── engineManager.js   # Multi-symbol coordinator, crash recovery & queueing
│   │   ├── candleService.js   # OHLCV aggregation for charts
│   │   └── wsService.js       # WebSocket real-time broadcast engine
│   ├── middleware/            # Express Middleware
│   │   ├── auth.js            # JWT verification & Admin role authorization
│   │   ├── errorHandler.js    # Standardized JSON error response handler
│   │   └── rateLimiter.js     # Sliding-window rate limiting for auth endpoints
│   ├── routes/                # REST API Endpoints
│   │   ├── authRoutes.js      # Signup, login, and user profile
│   │   ├── tradingRoutes.js   # Order placement, cancellation, depth snapshots
│   │   ├── walletRoutes.js    # Balances and anonymized personal trade history
│   │   ├── marketRoutes.js    # Public trade tape and candlestick OHLCV
│   │   └── adminRoutes.js     # Metrics, freezing users, granting funds, circuit breaker
│   ├── db/
│   │   └── connection.js      # Turnkey connection with MongoMemoryServer fallback
│   ├── app.js                 # Express app initialization & static client serving
│   └── server.js              # Server entry point
├── scripts/
│   ├── dev.js                 # Concurrent dev runner for backend & Vite client
│   ├── seed.js                # Database seeder with non-crossing demo orders
│   ├── stressTest.js          # Randomized differential stress test (150,000 orders)
│   ├── benchmarkEngine.js     # Microsecond-level engine latency & throughput benchmark
│   ├── benchmarkApi.js        # Autocannon HTTP REST API load testing
│   └── concurrencyTest.js     # Real API simultaneous Promise.all invariant test
├── tests/
│   ├── engine.test.js         # Pure engine unit tests (matches, cancels, priority)
│   ├── scenarios53_54.test.js # Exact specification tests for Sections 5.3 & 5.4
│   ├── wallet.test.js         # Double-entry balance conservation & atomic locks
│   └── api.test.js            # End-to-end API integration tests
└── client/                    # Plain, Clean React Web UI (Vite)
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx
        ├── styles.css         # Minimal, clean, non-flashy styling
        ├── api.js             # REST API client
        ├── ws.js              # WebSocket client with auto-reconnect
        └── components/        # Plain UI widgets (OrderBook, Form, Tape, Chart, Admin)
```

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js (v18+ recommended, verified on v24.14.0)
- npm (v9+)
- *MongoDB is optional!* The system includes an automated fallback to `mongodb-memory-server` if no local MongoDB instance is detected, running 100% out of the box.

### Commands

1. **Install Dependencies:**
   ```bash
   npm install
   npm --prefix client install
   ```

2. **Seed Initial Demo Data:**
   ```bash
   npm run seed
   ```
   *Populates admin, 3 trader accounts, tradable tickers (RELI, TCS, INFY), realistic trade history, and non-overlapping resting limit orders.*

3. **Start Development Environment:**
   ```bash
   npm run dev
   ```
   *Starts the Backend on `http://localhost:5000` and the React UI on `http://localhost:3000`.*

4. **Run Automated Test Suite:**
   ```bash
   npm test
   ```
   *Executes all 29 Jest tests (across 4 test suites) spanning the matching engine, mandated scenarios 5.3 and 5.4, wallet ledger conservation, and REST API integration.*

5. **Run Differential Stress Test (150,000 Orders):**
   ```bash
   npm run stress
   ```

6. **Run Pure Engine Benchmark:**
   ```bash
   npm run bench
   ```

7. **Run API Load Benchmark:**
   ```bash
   npm run bench:api
   ```

8. **Run API Concurrency Audit:**
   ```bash
   npm run test:concurrency
   ```

---

## 4. Demo Login Credentials

Seeded automatically by `npm run seed`:

| Role | Email | Password | Initial Balance | Stock Holdings |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@miniexchange.local` | `admin123` | ₹5,00,000.00 | 1,000 RELI, 1,000 TCS, 1,000 INFY |
| **Trader 1** | `alice@miniexchange.local` | `alice123` | ₹1,00,000.00 | 200 RELI, 150 TCS, 250 INFY |
| **Trader 2** | `bob@miniexchange.local` | `bob123` | ₹1,00,000.00 | 200 RELI, 150 TCS, 250 INFY |
| **Trader 3** | `charlie@miniexchange.local` | `charlie123` | ₹1,00,000.00 | 200 RELI, 150 TCS, 250 INFY |
`
*The web UI includes one-click autofill buttons on the login page for instant testing.*

---

## 5. Algorithmic Design & Data Structures

### Matching Engine Core
To satisfy strict price-time priority without $O(N)$ linear scans:
1. **Price Priority ($O(\log p)$ insert, $O(1)$ lookup):**
   - **Bids (BUY):** Maintained in a self-implemented array-based `MaxHeap`. The root is always the highest bid (Best Bid).
   - **Asks (SELL):** Maintained in a self-implemented `MinHeap`. The root is always the lowest ask (Best Ask).
   - An internal `indices` map (`price -> heapIndex`) allows removing any price level in $O(\log p)$ time when all orders at that price are cancelled or filled.
2. **Time Priority ($O(1)$ FIFO):**
   - Each `PriceLevel` encapsulates a custom `DoublyLinkedList`.
   - Incoming limit orders append to the tail in $O(1)$.
   - Matches always pull from the head in $O(1)$.
3. **Cancellation & Lookup ($O(1)$):**
   - A central `orders` HashMap maps `orderId -> { node, level, side, order }`.
   - Node pointer removal in a doubly linked list takes $O(1)$ without scanning.

### Time & Space Complexity Table

| Operation | Data Structure Used | Time Complexity | Space Complexity |
| :--- | :--- | :--- | :--- |
| **Inspect Best Bid / Best Ask** | MaxHeap / MinHeap Root | $O(1)$ | $O(1)$ |
| **Insert New Price Level** | Binary Heap Sift-Up | $O(\log p)$ | $O(1)$ |
| **Append Resting Order to Level** | Doubly Linked List Tail | $O(1)$ | $O(1)$ |
| **Match Oldest Order at Level** | Doubly Linked List Head | $O(1)$ | $O(1)$ |
| **Delete Filled/Empty Price Level**| Binary Heap Sift-Down | $O(\log p)$ | $O(1)$ |
| **Cancel Arbitrary Order** | HashMap Lookup + DLL Remove | $O(1)$ ($+ O(\log p)$ if level empty) | $O(1)$ |
| **Order Book Depth Snapshot** | Heap Array Sort (Top $K$) | $O(p \log p)$ | $O(p)$ |

*(Where $p$ is the number of distinct price levels and $N$ is the total number of active orders).*

---

## 6. Core Matching Rules & Policies

1. **Price-Time Priority:**
   - BUY orders match against the lowest ask prices first.
   - SELL orders match against the highest bid prices first.
   - At the same price level, earlier arrival orders execute first (FIFO).
2. **Resting Order Trade Pricing (Price Improvement):**
   - Trades execute at the price of the **resting order** (the order already sitting in the book), not the aggressor's price.
   - If an incoming BUY limit order arrives at ₹105.00 and matches against a resting SELL at ₹95.00, the trade executes at ₹95.00. The buyer receives a ₹10.00/unit price improvement rebate.
3. **Independent Order Evaluation (No All-or-Nothing):**
   - Resting orders are evaluated independently. An incoming order will sweep multiple levels and multiple counter-parties as long as prices satisfy its limit.
4. **Order Types:**
   - **LIMIT:** Matches whatever is possible at its price or better. Any unfilled remainder rests in the book.
   - **MARKET:** Has no limit price. Matches immediately against best available prices. If opposite book runs out, unfilled remainder is **cancelled** immediately and never rests. If the opposite side is empty upon arrival, it is **rejected**.
5. **Self-Trade Prevention Policy:**
   - An incoming order must never trade against a resting order belonging to the same user.
   - **MiniExchange Policy:** When an incoming order encounters a resting order belonging to the same `userId`, matching stops immediately and the incoming order's remaining quantity is **cancelled**. The resting order remains untouched in the book.
6. **No Crossed Book Invariant:**
   - After every single order placement, match, or cancellation, the book invariant $\text{Best Bid} < \text{Best Ask}$ is asserted.

---

## 7. Wallet & Double-Entry Accounting Logic

To guarantee that money is never created or lost:
1. **Pre-trade Atomic Locking:**
   - **BUY Limit:** Atomically locks $\text{price} \times \text{quantity}$ Paise from `cash.available` into `cash.locked` using MongoDB `$gte` conditional filters.
   - **SELL:** Atomically locks $\text{quantity}$ units from `holdings[symbol].available` into `holdings[symbol].locked`.
2. **Trade Settlement:**
   - Cash moves from buyer's `cash.locked` to seller's `cash.available`.
   - Asset units move from seller's `holdings.locked` to buyer's `holdings.available`.
   - If a buyer's limit price was higher than the executed resting price, the surplus locked cash is refunded directly to buyer's `cash.available`.
3. **Cancellation Release:**
   - When an order is cancelled or a market order has an unfilled remainder, remaining locked funds/units are released back to available balance.
4. **System Invariant:**
   - Total cash in the system across all users is strictly conserved ($\Delta \text{Cash} = 0$).
   - Total units per symbol in the system are strictly conserved ($\Delta \text{Units} = 0$).

---

## 8. Concurrency & Serial Queue Design

In financial exchanges, race conditions corrupt order books if two concurrent requests attempt to match against the same resting order simultaneously.

- MiniExchange implements a **single-threaded sequential queue per symbol** (`Promise`-chained execution queue in `OrderBook`).
- Even when 100 concurrent requests arrive over HTTP, requests for the same symbol are queued and executed strictly one-at-a-time through the engine.
- Orders across *different* symbols (e.g. RELI vs TCS) execute independently and concurrently without blocking each other.

---

## 9. Design Decisions & Rationale

1. **Integer Arithmetic (Paise):**
   - Floating point representation in JavaScript (IEEE 754) introduces precision errors (e.g., `0.1 + 0.2 !== 0.3`). MiniExchange stores all prices and cash balances as 64-bit integers in Paise (1 INR = 100 paise), avoiding rounding bugs.
2. **Custom Binary Heap with Lazy Removal vs External Libraries:**
   - Instead of pulling in a heavy external npm tree library, the engine uses a custom `BinaryHeap` with index tracking. This enables $O(1)$ top access, $O(\log p)$ insertions, and zero runtime dependencies.
3. **Pure Standalone Engine:**
   - `src/engine/` is decoupled from Express, MongoDB, and WebSockets. This architectural boundary makes microsecond benchmarking, randomized fuzzing, and unit testing fast and repeatable.
4. **Turnkey MongoMemoryServer Fallback:**
   - To ensure that any evaluator or recruiter can clone and run `npm test` or `npm run dev` with zero setup or external daemon installations, the database connection automatically detects local MongoDB and transparently falls back to an in-memory replica if absent.
5. **Minimal Plain UI:**
   - The user interface uses standard HTML tables, clean border lines, and system typography. By avoiding AI-style neon gradients or bloated UI libraries, the codebase remains lightweight and emphasizes core systems engineering.

---

## 10. Testing, Benchmarks & Real Measured Results

*All benchmarks were executed on an AMD Ryzen 5 5600H (6 Cores, 12 Threads @ 3.3 GHz) running Windows 11 and Node.js v24.14.0.*

### 10.1 Automated Unit & Integration Tests (Jest)
- **Engine Tests:** 17 unit tests verifying matching, fairness, FIFO queueing, multi-level sweeps, partial fills, market order rejection, cancellation, and validation.
- **Section 5.3 & 5.4 Mandated Scenarios:** Exact unit tests for all 3 cases of buyer matching multiple sellers, and sellers matching multiple buyers at resting prices.
- **Ledger Tests:** Verification of atomic locks, price rebates, and double-entry conservation.
- **API Tests:** End-to-end integration tests for auth, trading, market data, and admin endpoints.
- **Result:** **29 of 29 tests passed (100% green), across 4 test suites.**

### 10.2 Randomized Differential Stress Testing (150,000 Orders)
The optimized `OrderBook` was verified against `ReferenceEngine` (a brute-force, array-scanning reference engine). A seeded deterministic PRNG (Mulberry32) generated 150,000 orders across 6 independent seeds (five 10,000 order runs + one 100,000 order run) with random limit/market types, dense price corridors, and random cancellations.

| Run / Seed | Orders Processed | Trades Executed | Units Traded | Cancellations | Invariant Audit | Mismatches |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Seed 101** | 10,000 | 6,478 | 36,361 | 273 | 100% Verified | **0** |
| **Seed 202** | 10,000 | 6,483 | 36,439 | 281 | 100% Verified | **0** |
| **Seed 303** | 10,000 | 6,379 | 36,132 | 269 | 100% Verified | **0** |
| **Seed 404** | 10,000 | 6,284 | 35,526 | 276 | 100% Verified | **0** |
| **Seed 505** | 10,000 | 6,535 | 36,481 | 281 | 100% Verified | **0** |
| **Seed 9999**| 100,000 | 64,547 | 363,533 | 2,661 | 100% Verified | **0** |
| **Total** | **150,000** | **96,706** | **544,472** | **4,041** | **Zero Leaks** | **0** |

### 10.3 Pure Engine Micro-Benchmark (100,000 Orders x 5 Iterations)
Measured using high-resolution monotonic timestamps (`process.hrtime.bigint`):

| Iteration | Throughput (Orders / sec) | Total Duration (ms) | p50 Latency (µs) | p95 Latency (µs) | p99 Latency (µs) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Run 1 | 178,164 ops/sec | 561 ms | 3.5 µs | 8.8 µs | 21.5 µs |
| Run 2 | 212,835 ops/sec | 470 ms | 3.1 µs | 8.0 µs | 17.9 µs |
| Run 3 | 256,399 ops/sec | 390 ms | 2.8 µs | 6.0 µs | 9.3 µs |
| Run 4 | 253,081 ops/sec | 395 ms | 2.7 µs | 6.6 µs | 16.7 µs |
| Run 5 | 287,333 ops/sec | 348 ms | 2.6 µs | 5.2 µs | 7.9 µs |
| **MEDIAN** | **253,081 ops/sec** | **395 ms** | **2.7 µs (0.003 ms)**| **6.6 µs** | **16.7 µs** |

#### Order Book Depth Scaling Analysis
Latency remained uniform as book depth grew from 0 to 100,000 orders:
- **0 - 25,000 Orders:** p50: 2.9 µs | p95: 6.4 µs | p99: 9.9 µs
- **25,000 - 50,000 Orders:** p50: 2.8 µs | p95: 6.2 µs | p99: 9.7 µs
- **50,000 - 75,000 Orders:** p50: 2.7 µs | p95: 5.5 µs | p99: 8.3 µs
- **75,000 - 100,000 Orders:** p50: 2.8 µs | p95: 6.0 µs | p99: 9.3 µs

### 10.4 Real HTTP API Benchmark (Autocannon)
Measured over full HTTP network stack (Express router, JWT decoding, MongoDB I/O):

| Endpoint | Operations / sec | Average Latency | p99 Latency |
| :--- | :--- | :--- | :--- |
| `GET /api/orderbook/RELI` (Market Read) | **2,680.6 req / sec** | 3.26 ms | 7.00 ms |
| `POST /api/orders` (Full Write Pipeline) | **107.2 req / sec** | 92.42 ms | 303.00 ms |

### 10.5 Simultaneous Concurrency Audit (Promise.all)
- Dispatched 100 simultaneous real API order requests concurrently across 4 accounts.
- **Total Duration:** 3,721 ms (27 req/sec full pipeline throughput).
- **Post-run Audit:**
  - Zero negative cash balances.
  - Zero negative stock holdings.
  - 100% Cash conservation (₹2,00,000.00 initial == ₹2,00,000.00 final).
  - 100% Unit conservation (2,000 units initial == 2,000 units final).
  - 86 trades settled cleanly.
  - Book uncrossed ($\text{Best Bid} < \text{Best Ask}$).

---

## 11. Known Limitations & Production Considerations

1. **Single-Node In-Memory State:**
   - The order book resides in Node.js process memory. While crash recovery restores state by replaying pending database orders on boot, high availability across multiple physical nodes would require Raft-based consensus or an event-sourcing write-ahead log (WAL).
2. **Replay Time on Large Datasets:**
   - On server restart, all `OPEN` orders are loaded and inserted sequentially into the in-memory engine. For books with millions of active resting orders, snapshotting the book state would be necessary to keep boot time near instant.
3. **Database Write Bottleneck:**
   - While the pure matching engine processes over 250,000 orders/sec in memory, writing each matched trade and updating resting order records in MongoDB caps full-stack throughput to ~110 writes/sec on a local disk without batching. In high-frequency production exchanges, trades are flushed to disk via an asynchronous ring buffer (e.g. LMAX Disruptor pattern).
