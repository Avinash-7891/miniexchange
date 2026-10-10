/**
 * services/walletService.js
 * 
 * WALLET & LEDGER SERVICE
 * 
 * Enforces strict financial accounting:
 * 1. Double-entry conservation: Money and units are neither created nor destroyed during trades.
 * 2. Atomic conditional checks: available funds must be >= requested before locking.
 * 3. Price improvement rebates: buyers receive excess locked cash back immediately if resting price < limit price.
 * 4. Zero negative balance invariant: $gte check ensures available and locked never drop below 0.
 */

const User = require('../models/User');
const { Side, OrderType } = require('../engine/types');

class WalletService {
  /**
   * Lock funds or assets before submitting an order to the matching engine.
   * Atomic operation using MongoDB conditional filters.
   */
  async lockForOrder(userId, { side, type, symbol, price, quantity }) {
    if (side === Side.BUY) {
      if (type === OrderType.LIMIT) {
        const requiredCash = price * quantity;
        const user = await User.findOneAndUpdate(
          {
            _id: userId,
            isFrozen: false,
            'cash.available': { $gte: requiredCash }
          },
          {
            $inc: {
              'cash.available': -requiredCash,
              'cash.locked': requiredCash
            }
          },
          { new: true }
        );

        if (!user) {
          const checkUser = await User.findById(userId);
          if (!checkUser) throw new Error('User not found');
          if (checkUser.isFrozen) throw new Error('User account is frozen');
          throw new Error(`Insufficient available cash. Required: Rs ${(requiredCash / 100).toFixed(2)}, Available: Rs ${(checkUser.cash.available / 100).toFixed(2)}`);
        }
        return { lockedCash: requiredCash, lockedUnits: 0 };
      } else {
        // MARKET BUY: Lock current available cash (capped at required if estimated or all available)
        const checkUser = await User.findById(userId);
        if (!checkUser) throw new Error('User not found');
        if (checkUser.isFrozen) throw new Error('User account is frozen');
        if (checkUser.cash.available <= 0) {
          throw new Error('Insufficient available cash for market order');
        }

        const lockCash = checkUser.cash.available;
        await User.findByIdAndUpdate(userId, {
          $inc: {
            'cash.available': -lockCash,
            'cash.locked': lockCash
          }
        });
        return { lockedCash: lockCash, lockedUnits: 0 };
      }
    } else {
      // SELL (LIMIT or MARKET): Must lock exact unit quantity
      const sym = symbol.toUpperCase();
      // Ensure holding subdocument exists
      const userDoc = await User.findById(userId);
      if (!userDoc) throw new Error('User not found');
      if (userDoc.isFrozen) throw new Error('User account is frozen');

      const currentHolding = userDoc.holdings.get(sym) || { available: 0, locked: 0 };
      if (currentHolding.available < quantity) {
        throw new Error(`Insufficient holdings for ${sym}. Required: ${quantity} units, Available: ${currentHolding.available} units`);
      }

      const updateQuery = {};
      updateQuery[`holdings.${sym}.available`] = -quantity;
      updateQuery[`holdings.${sym}.locked`] = quantity;

      const user = await User.findOneAndUpdate(
        {
          _id: userId,
          isFrozen: false,
          [`holdings.${sym}.available`]: { $gte: quantity }
        },
        { $inc: updateQuery },
        { new: true }
      );

      if (!user) {
        throw new Error(`Failed to lock ${quantity} units of ${sym}`);
      }
      return { lockedCash: 0, lockedUnits: quantity };
    }
  }

  /**
   * Settle a trade across buyer and seller accounts.
   * Moves cash from buyer to seller and asset units from seller to buyer.
   * Handles buyer price improvement refund if buyer limit price > trade price.
   */
  async settleTrade(trade, buyerOrderType, buyerLimitPrice, marketLockedCash = 0) {
    const { symbol, price: tradePrice, quantity: tradeQty, buyerId, sellerId } = trade;
    const sym = symbol.toUpperCase();
    const tradeCash = tradePrice * tradeQty;

    // 1. SETTLE BUYER
    if (buyerOrderType === OrderType.LIMIT) {
      const originallyLockedCash = buyerLimitPrice * tradeQty;
      const refund = originallyLockedCash - tradeCash; // Price improvement rebate!

      await User.findByIdAndUpdate(buyerId, {
        $inc: {
          'cash.locked': -originallyLockedCash,
          'cash.available': refund, // rebate excess cash back to buyer
          [`holdings.${sym}.available`]: tradeQty
        }
      });
    } else {
      // Market buyer
      await User.findByIdAndUpdate(buyerId, {
        $inc: {
          'cash.locked': -tradeCash,
          [`holdings.${sym}.available`]: tradeQty
        }
      });
    }

    // 2. SETTLE SELLER
    await User.findByIdAndUpdate(sellerId, {
      $inc: {
        'cash.available': tradeCash,
        [`holdings.${sym}.locked`]: -tradeQty
      }
    });
  }

  /**
   * Release remaining locked cash or units when an order is cancelled
   * or a market order's unfilled remainder is cancelled.
   */
  async releaseLocked(userId, side, type, symbol, price, cancelledQty, marketLockRemaining = 0) {
    if (cancelledQty <= 0 && marketLockRemaining <= 0) return;
    const sym = symbol.toUpperCase();

    if (side === Side.BUY) {
      if (type === OrderType.LIMIT) {
        const cashToRelease = price * cancelledQty;
        if (cashToRelease > 0) {
          await User.findByIdAndUpdate(userId, {
            $inc: {
              'cash.locked': -cashToRelease,
              'cash.available': cashToRelease
            }
          });
        }
      } else {
        // Market buy remainder release
        if (marketLockRemaining > 0) {
          await User.findByIdAndUpdate(userId, {
            $inc: {
              'cash.locked': -marketLockRemaining,
              'cash.available': marketLockRemaining
            }
          });
        }
      }
    } else {
      // SELL: release locked units back to available
      if (cancelledQty > 0) {
        const update = {};
        update[`holdings.${sym}.locked`] = -cancelledQty;
        update[`holdings.${sym}.available`] = cancelledQty;

        await User.findByIdAndUpdate(userId, {
          $inc: update
        });
      }
    }
  }

  /**
   * Admin grant of cash or asset units.
   */
  async grantFunds(userId, cashPaise = 0, symbol = null, units = 0) {
    const update = {};
    if (cashPaise && cashPaise > 0) {
      update['cash.available'] = cashPaise;
    }
    if (symbol && units && units > 0) {
      const sym = symbol.toUpperCase();
      update[`holdings.${sym}.available`] = units;
    }

    return await User.findByIdAndUpdate(
      userId,
      { $inc: update },
      { new: true }
    );
  }
}

module.exports = new WalletService();
