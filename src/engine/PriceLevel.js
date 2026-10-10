/**
 * PriceLevel.js
 * 
 * Represents an aggregated price level in the Order Book.
 * All orders at this price are stored in a DoublyLinkedList ensuring strict FIFO order.
 * 
 * In limit order books, keeping price levels aggregated allows:
 *   1. O(1) query of total available liquidity at this exact price.
 *   2. O(1) matching against the oldest resting order at this price.
 *   3. O(1) appending of incoming limit orders at this price.
 */

const { DoublyLinkedList } = require('./DoublyLinkedList');

class PriceLevel {
  /**
   * @param {number} price - Integer price in Paise
   */
  constructor(price) {
    if (!Number.isInteger(price) || price <= 0) {
      throw new Error(`Invalid price for PriceLevel: ${price}. Must be a positive integer.`);
    }
    this.price = price;
    this.orders = new DoublyLinkedList();
  }

  /**
   * Add a resting order to the tail of this price level in O(1) time.
   * @param {Object} order 
   * @returns {ListNode} pointer to the node stored in the list
   */
  addOrder(order) {
    return this.orders.append(order);
  }

  /**
   * Remove an order node from this price level in O(1) time.
   * @param {ListNode} node 
   */
  removeOrderNode(node) {
    this.orders.removeNode(node);
  }

  /**
   * Oldest order at this level (FIFO candidate for matching).
   * @returns {Object|null}
   */
  peekFront() {
    return this.orders.peekFront();
  }

  /**
   * Total unfulfilled volume remaining across all orders at this level.
   * @returns {number}
   */
  get totalVolume() {
    return this.orders.totalVolume;
  }

  /**
   * Count of active orders at this price level.
   * @returns {number}
   */
  get orderCount() {
    return this.orders.length;
  }

  /**
   * Checks if this price level has zero active orders.
   * @returns {boolean}
   */
  isEmpty() {
    return this.orders.isEmpty();
  }

  /**
   * Convert orders to an array for debugging/testing.
   */
  toArray() {
    return this.orders.toArray();
  }
}

module.exports = { PriceLevel };
