/**
 * Simple in-memory cache with TTL (Time To Live)
 */
class Cache {
  constructor(defaultTTL = 60 * 60 * 1000) { // Default TTL: 1 hour
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.lastCleanup = Date.now();

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);

    // Handle Node.js process exit to prevent memory leaks
    if (typeof process !== 'undefined') {
      process.on('exit', () => this.destroy());
      // Handle CTRL+C and other signals
      ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
        process.on(signal, () => {
          this.destroy();
          process.exit(0);
        });
      });
    }
  }

  /**
   * Destroy the cache and clear the cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  /**
   * Set a value in the cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to store
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = this.defaultTTL) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
    return value;
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found or expired
   */
  get(key) {
    const item = this.cache.get(key);

    // Return null if item doesn't exist or is expired
    if (!item || item.expiry < Date.now()) {
      if (item) this.cache.delete(key); // Clean up expired item
      return null;
    }

    return item.value;
  }

  /**
   * Check if a key exists in the cache and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} - True if key exists and is not expired
   */
  has(key) {
    const item = this.cache.get(key);
    return item !== undefined && item.expiry >= Date.now();
  }

  /**
   * Delete a key from the cache
   * @param {string} key - Cache key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Delete all expired cache entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry < now) {
        this.cache.delete(key);
      }
    }
    this.lastCleanup = now;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      lastCleanup: this.lastCleanup
    };
  }
}

module.exports = Cache;
