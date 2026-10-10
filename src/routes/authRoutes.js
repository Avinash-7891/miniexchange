/**
 * routes/authRoutes.js
 * 
 * USER AUTHENTICATION ROUTES (Signup & Login)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { Role } = require('../engine/types');
const { createRateLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');

const loginLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 25 });

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Initial starter fake money: Rs 5,000.00 (500,000 paise) so student/user can start trading
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: Role.USER, // STRICT: Signup NEVER creates admin
      cash: {
        available: 500000,
        locked: 0
      },
      holdings: {
        RELI: { available: 50, locked: 0 },
        TCS: { available: 50, locked: 0 },
        INFY: { available: 50, locked: 0 }
      }
    });

    const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
