/**
 * Heap.js
 * 
 * WHY A HEAP FOR PRICE LEVELS:
 * The Order Book needs to find the "best" price instantly:
 *   - For Bids: The highest buy price (Max Heap).
 *   - For Asks: The lowest sell price (Min Heap).
 * 
 * Performance:
 *   - peek() / find best price: O(1)
 *   - push() / insert new price level: O(log p), where p = number of distinct price levels.
 *   - pop() / remove best price level when fully filled: O(log p).
 *   - remove() arbitrary price level: O(log p) using index tracking map.
 * 
 * Why not a simple sorted array?
 *   - In a sorted array, inserting a new price level requires shifting elements, which takes O(p).
 *   - A binary heap guarantees logarithmic O(log p) insertions and deletions, and O(1) top access.
 * 
 * Index Tracking & Lazy Deletion:
 *   We maintain an internal `indices` map (price -> index in heap array) so any price level
 *   that becomes empty (via cancellations or matches) can be removed in O(log p) immediately.
 *   Additionally, peek() performs a lazy clean if any stale/empty levels reach the top.
 */

class BinaryHeap {
  /**
   * @param {Function} comparator - (a, b) => boolean: returns true if 'a' has higher priority than 'b'
   */
  constructor(comparator) {
    this.comparator = comparator;
    this.data = [];                 // Array-based binary tree representation
    this.indices = new Map();       // price -> index in this.data
  }

  get size() {
    return this.data.length;
  }

  isEmpty() {
    return this.data.length === 0;
  }

  /**
   * Swap two nodes in the heap array and update their tracked indices.
   * @param {number} i 
   * @param {number} j 
   */
  _swap(i, j) {
    const temp = this.data[i];
    this.data[i] = this.data[j];
    this.data[j] = temp;

    this.indices.set(this.data[i].price, i);
    this.indices.set(this.data[j].price, j);
  }

  _parent(i) {
    return Math.floor((i - 1) / 2);
  }

  _left(i) {
    return 2 * i + 1;
  }

  _right(i) {
    return 2 * i + 2;
  }

  /**
   * Bubble node up to restore heap invariant. O(log p)
   * @param {number} i 
   */
  _siftUp(i) {
    while (i > 0) {
      const p = this._parent(i);
      if (this.comparator(this.data[i], this.data[p])) {
        this._swap(i, p);
        i = p;
      } else {
        break;
      }
    }
  }

  /**
   * Bubble node down to restore heap invariant. O(log p)
   * @param {number} i 
   */
  _siftDown(i) {
    const n = this.data.length;
    while (true) {
      let best = i;
      const left = this._left(i);
      const right = this._right(i);

      if (left < n && this.comparator(this.data[left], this.data[best])) {
        best = left;
      }
      if (right < n && this.comparator(this.data[right], this.data[best])) {
        best = right;
      }

      if (best !== i) {
        this._swap(i, best);
        i = best;
      } else {
        break;
      }
    }
  }

  /**
   * Insert a price level into the heap. O(log p)
   * @param {PriceLevel} level 
   */
  push(level) {
    if (this.indices.has(level.price)) {
      // Level already exists in heap
      return;
    }
    const idx = this.data.length;
    this.data.push(level);
    this.indices.set(level.price, idx);
    this._siftUp(idx);
  }

  /**
   * Remove and return the top (best) price level. O(log p)
   * @returns {PriceLevel|null}
   */
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    this.remove(top.price);
    return top;
  }

  /**
   * View the top (best) price level without removing it. O(1)
   * @returns {PriceLevel|null}
   */
  peek() {
    return this.data.length > 0 ? this.data[0] : null;
  }

  /**
   * Explicitly remove a specific price level in O(log p).
   * @param {PriceLevel|number} levelOrPrice 
   */
  remove(levelOrPrice) {
    const price = typeof levelOrPrice === 'number' ? levelOrPrice : levelOrPrice.price;
    const idx = this.indices.get(price);
    if (idx === undefined) return false;

    const lastIdx = this.data.length - 1;
    if (idx === lastIdx) {
      this.data.pop();
      this.indices.delete(price);
      return true;
    }

    const removed = this.data[idx];
    const last = this.data.pop();
    this.indices.delete(removed.price);

    this.data[idx] = last;
    this.indices.set(last.price, idx);

    // Node at idx might need to sift up or sift down
    const p = this._parent(idx);
    if (idx > 0 && this.comparator(this.data[idx], this.data[p])) {
      this._siftUp(idx);
    } else {
      this._siftDown(idx);
    }
    return true;
  }

  /**
   * Discards any empty price levels sitting at the top of the heap (lazy deletion).
   */
  _cleanTopEmpty() {
    while (this.data.length > 0 && this.data[0].isEmpty()) {
      const emptyLevel = this.data[0];
      const last = this.data.pop();
      this.indices.delete(emptyLevel.price);
      if (this.data.length > 0) {
        this.data[0] = last;
        this.indices.set(last.price, 0);
        this._siftDown(0);
      }
    }
  }

  /**
   * Export sorted price levels (for orderbook depth snapshot).
   * Note: Clones the array so heap structure is not mutated.
   * @returns {Array<PriceLevel>}
   */
  getSortedLevels() {
    // Filter out empty levels first
    const active = this.data.filter(l => !l.isEmpty());
    // Sort according to comparator priority
    return active.sort((a, b) => (this.comparator(a, b) ? -1 : 1));
  }
}

/**
 * MaxHeap for BUY orders (highest bid price comes first).
 */
class MaxHeap extends BinaryHeap {
  constructor() {
    super((a, b) => a.price > b.price);
  }
}

/**
 * MinHeap for SELL orders (lowest ask price comes first).
 */
class MinHeap extends BinaryHeap {
  constructor() {
    super((a, b) => a.price < b.price);
  }
}

module.exports = {
  BinaryHeap,
  MaxHeap,
  MinHeap
};
