/**
 * middleware/auth.js
 * 
 * JWT AUTHENTICATION & ROLE-BASED ACCESS CONTROL
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { Role } = require('../engine/types');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token: User not found.' });
    }

    if (user.isFrozen && req.method !== 'GET') {
      return res.status(403).json({ error: 'Your account is frozen by an administrator. Read-only access.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin
};
