/**
 * In-Process TTL Cache
 *
 * A lightweight, zero-dependency cache backed by a JavaScript Map.
 * Designed for caching per-user analytics aggregations on a single-instance
 * Node.js server (Render free tier).
 *
 * Trade-offs vs Redis:
 *  ✅ Zero latency (no network hop)
 *  ✅ Zero cost
 *  ✅ Zero configuration
 *  ❌ Lost on server restart (acceptable — cache is a perf layer, not data store)
 *  ❌ Not shared across multiple instances (upgrade path: swap this for Upstash Redis)
 *
 * Cache key convention: `${userId}:${endpoint}:${params}`
 *   e.g. "507f1f77bcf86cd799439011:summary:month"
 *        "507f1f77bcf86cd799439011:monthly"
 *
 * Invalidation strategy: when a user writes (add/delete transaction),
 * call cache.delByPrefix(userId) to wipe all their cached analytics.
 */
class TTLCache {
  constructor(defaultTtlMs = 5 * 60 * 1000) {
    this.store = new Map();
    this.defaultTtl = defaultTtlMs;

    // Periodic cleanup to prevent unbounded memory growth.
    // Expired entries are also removed lazily on get(), but this
    // catches entries that are never accessed again.
    this.cleanupInterval = setInterval(
      () => this._cleanup(),
      10 * 60 * 1000, // run every 10 minutes
    );

    // unref() allows Node.js to exit cleanly even if this timer is pending.
    // Without this, the process would hang during graceful shutdown.
    this.cleanupInterval.unref();
  }

  /**
   * Store a value under a key with an optional TTL.
   * @param {string} key
   * @param {*} value - Must be JSON-serializable
   * @param {number} [ttlMs] - Milliseconds until expiry. Defaults to 5 minutes.
   */
  set(key, value, ttlMs = this.defaultTtl) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Retrieve a value. Returns null if missing or expired.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      // Lazy eviction — remove expired entry on access
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Delete a single key.
   * @param {string} key
   */
  del(key) {
    this.store.delete(key);
  }

  /**
   * Delete all keys that begin with a given prefix.
   * Primary use: invalidate all analytics cache for a user after a write.
   *
   * @param {string} prefix - e.g. a userId string
   * @returns {number} - Number of entries deleted
   */
  delByPrefix(prefix) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Current number of entries (including not-yet-evicted expired ones).
   */
  get size() {
    return this.store.size;
  }

  /** Remove all expired entries. Called automatically on a timer. */
  _cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[Cache] Cleanup: removed ${removed} expired entries. Size: ${this.store.size}`);
    }
  }
}

// Export a singleton — Node's module system caches require() results,
// so every file that requires this gets the same TTLCache instance.
module.exports = new TTLCache();
