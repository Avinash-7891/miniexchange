/**
 * models/User.js
 * 
 * USER & WALLET LEDGER MODEL
 * 
 * Rules:
 * - Passwords hashed via bcrypt.
 * - Role: 'user' or 'admin'. Only seed script creates 'admin'.
 * - Cash: stored as integers in paise (1 INR = 100 paise).
 * - Holdings: stored per symbol as integer unit counts.
 * - Both cash and holdings maintain 'available' and 'locked' pools.
 * - Balances must NEVER be negative.
 */

const mongoose = require('mongoose');
const { Role } = require('../engine/types');

const HoldingSchema = new mongoose.Schema({
  available: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Available units cannot be negative']
  },
  locked: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Locked units cannot be negative']
  }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: [true, 'Password hash is required']
  },
  role: {
    type: String,
    enum: Object.values(Role),
    default: Role.USER
  },
  isFrozen: {
    type: Boolean,
    default: false
  },
  cash: {
    available: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Available cash cannot be negative']
    },
    locked: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Locked cash cannot be negative']
    }
  },
  // Map of symbol -> { available, locked }
  holdings: {
    type: Map,
    of: HoldingSchema,
    default: {}
  }
}, {
  timestamps: true
});

// Helper to sanitize user object for client responses (strips password hash)
UserSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.passwordHash;
  delete user.__v;
  return user;
};

module.exports = mongoose.model('User', UserSchema);
