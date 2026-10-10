/**
 * db/connection.js
 * 
 * TURNKEY MONGODB CONNECTION MANAGER
 * 
 * Automatically connects to:
 * 1. Provided MONGODB_URI (e.g. local or Docker MongoDB instance).
 * 2. If no MongoDB is reachable or in test/memory mode, automatically boots
 *    `MongoMemoryServer` so the app, tests, and seed scripts run with zero configuration!
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoMemoryServer = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const configuredUri = process.env.MONGODB_URI;
  const forceMemory = process.env.USE_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test';

  if (configuredUri && !forceMemory) {
    try {
      console.log(`Connecting to MongoDB at: ${configuredUri}...`);
      await mongoose.connect(configuredUri, {
        serverSelectionTimeoutMS: 2000
      });
      console.log('MongoDB successfully connected.');
      return mongoose.connection;
    } catch (err) {
      console.warn(`Could not connect to external MongoDB at ${configuredUri} (${err.message}). Falling back to MongoMemoryServer...`);
    }
  }

  // Fallback to in-memory MongoDB
  if (!mongoMemoryServer) {
    console.log('Starting in-memory MongoDB server (MongoMemoryServer)...');
    mongoMemoryServer = await MongoMemoryServer.create();
  }
  const memoryUri = mongoMemoryServer.getUri();
  console.log(`Connecting to in-memory MongoDB at ${memoryUri}...`);
  await mongoose.connect(memoryUri);
  console.log('In-memory MongoDB successfully connected.');

  return mongoose.connection;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
}

async function clearDB() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  clearDB
};
