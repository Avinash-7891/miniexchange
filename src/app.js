/**
 * app.js
 * 
 * EXPRESS APPLICATION CONFIGURATION & ROUTE MOUNTING
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const tradingRoutes = require('./routes/tradingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const marketRoutes = require('./routes/marketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MiniExchange API', timestamp: Date.now() });
});

// REST API routes
app.use('/api', authRoutes);
app.use('/api', tradingRoutes);
app.use('/api', walletRoutes);
app.use('/api', marketRoutes);
app.use('/api/admin', adminRoutes);

// Serve client build if available
const fs = require('fs');
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Centralized error handler
app.use(errorHandler);

module.exports = app;
