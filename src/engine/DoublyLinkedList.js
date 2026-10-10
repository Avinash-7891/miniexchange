/**
 * DoublyLinkedList.js
 * 
 * WHY THIS DATA STRUCTURE:
 * Inside an Order Book, every price level maintains a FIFO queue of resting orders.
 * Using a native JavaScript Array for this would mean:
 *   - shift() takes O(N) because all remaining elements shift in memory.
 *   - cancelling an arbitrary order takes O(N) to find and splice().
 * 
 * With a Doubly Linked List:
 *   - Appending a new order at the tail is O(1).
 *   - Popping the oldest order from the head is O(1).
 *   - Removing ANY arbitrary order given a reference to its node is O(1)
 *     (by updating node.prev.next and node.next.prev).
 * 
 * Space Complexity: O(N) where N is the number of active orders at this price level.
 */

class ListNode {
  constructor(order) {
    this.order = order; // Payload: Order object
    this.prev = null;   // Pointer to previous node in arrival order
    this.next = null;   // Pointer to next node in arrival order
  }
}

class DoublyLinkedList {
  constructor() {
    this.head = null;       // Oldest order at this price level
    this.tail = null;       // Newest order at this price level
    this.length = 0;        // Count of active orders
    this.totalVolume = 0;   // Sum of remaining quantities of all orders in this list
  }

  /**
   * Append a new order to the end (tail) of the list in O(1) time.
   * @param {Object} order 
   * @returns {ListNode} the created node
   */
  append(order) {
    const node = new ListNode(order);
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this.length += 1;
    this.totalVolume += order.remainingQty;
    return node;
  }

  /**
   * Remove the oldest order from the front (head) of the list in O(1) time.
   * @returns {Object|null} the removed Order object, or null if empty
   */
  popFront() {
    if (!this.head) return null;
    const node = this.head;
    this.removeNode(node);
    return node.order;
  }

  /**
   * Remove an arbitrary node from anywhere in the list in O(1) time.
   * @param {ListNode} node 
   */
  removeNode(node) {
    if (!node) return;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      // Removing head
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      // Removing tail
      this.tail = node.prev;
    }

    this.length -= 1;
    this.totalVolume -= node.order.remainingQty;

    // Clean pointers to prevent memory leaks and dangling links
    node.prev = null;
    node.next = null;
  }

  /**
   * Peek at the oldest order at this price level without removing it in O(1) time.
   * @returns {Object|null}
   */
  peekFront() {
    return this.head ? this.head.order : null;
  }

  /**
   * Check if list is empty in O(1) time.
   * @returns {boolean}
   */
  isEmpty() {
    return this.length === 0;
  }

  /**
   * Helper to return all orders as an array (for snapshots / testing / serialization).
   * Time Complexity: O(N)
   * @returns {Array<Object>}
   */
  toArray() {
    const list = [];
    let curr = this.head;
    while (curr) {
      list.push(curr.order);
      curr = curr.next;
    }
    return list;
  }
}

module.exports = {
  ListNode,
  DoublyLinkedList
};
