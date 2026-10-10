/**
 * server.js
 * 
 * SERVER ENTRY POINT
 * 
 * Starts HTTP server, initializes MongoDB connection, boots WebSocket engine,
 * and recovers resting order books.
 */

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB } = require('./db/connection');
const engineManager = require('./services/engineManager');
const wsService = require('./services/wsService');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Connect to Database (turnkey fallback to MongoMemoryServer if local mongo not found)
    await connectDB();

    const User = require('./models/User');
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Fresh database detected. Auto-seeding demo users and order books...');
      const { seed } = require('../scripts/seed');
      await seed();
    } else {
      // 2. Initialize in-memory matching engine and restore resting orders
      await engineManager.init();
    }

    // 3. Create HTTP Server
    const server = http.createServer(app);

    // 4. Attach WebSocket Server
    wsService.init(server);

    // 5. Start listening
    server.listen(PORT, () => {
      console.log(`======================================================`);
      console.log(`MiniExchange Backend Server running on port ${PORT}`);
      console.log(`  - HTTP API:  http://localhost:${PORT}/api`);
      console.log(`  - WebSocket: ws://localhost:${PORT}/ws`);
      console.log(`======================================================`);
    });

    return server;
  } catch (err) {
    console.error('Fatal error starting MiniExchange server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
