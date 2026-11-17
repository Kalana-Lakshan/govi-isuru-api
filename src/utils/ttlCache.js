// Small in-memory cache with expiry and a size cap (oldest entries evicted first).
// Used for third-party lookups (weather, AI news summaries) so repeated requests don't hit paid/rate-limited APIs.
class TtlCache {
  constructor({ ttlMs, max = 500 }) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.map = new Map();
    this.pending = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.exp) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.map.delete(key);
    this.map.set(key, { value, exp: Date.now() + ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }

  // Returns the cached value or computes it once, even when many requests ask at the same time.
  async wrap(key, fn, ttlMs) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      try {
        return this.set(key, await fn(), ttlMs);
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, p);
    return p;
  }

  get size() {
    return this.map.size;
  }
}

module.exports = TtlCache;
