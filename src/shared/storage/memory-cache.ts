// A bounded, insertion-ordered in-memory cache with an optional TTL. Eviction is oldest-first by
// Map insertion order, so callers that rely on FIFO eviction (the tides per-station caches) and on
// dropping the least-recently-inserted view (the weather grid cache) both get the order they expect.
// With the default infinite TTL nothing ever expires, which is the tides model. A finite TTL makes
// `get` drop an expired entry on read and `put` sweep expired entries before inserting, which is the
// weather model.
export class MemoryCache<V> {
  #entries = new Map<string, { value: V; expires: number }>();
  #maxEntries: number;
  #ttlMs: number;

  constructor(maxEntries: number, ttlMs = Number.POSITIVE_INFINITY) {
    this.#maxEntries = maxEntries;
    this.#ttlMs = ttlMs;
  }

  get(key: string, now: number): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  put(key: string, value: V, now: number): void {
    for (const [k, entry] of this.#entries) if (entry.expires <= now) this.#entries.delete(k);
    this.#entries.set(key, { value, expires: now + this.#ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }
}
