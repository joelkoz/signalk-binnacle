import type { RangeResponse, Source } from 'pmtiles';
import { degradeToMemory, openIdbDatabase, reqPromise, txDone } from '$shared/storage';

// A protocol-layer block cache for PMTiles archives. The HTTP layer cannot give these
// archives durable caching: range reads answer 206 Partial Content, which the Cache API
// refuses to store, so a service worker can never cache them, and the browser disk cache
// is bypassed on purpose (see NoStoreSource in pmtiles.ts). Caching aligned blocks in
// IndexedDB works in every context, including the plain-http boat LAN where service
// workers are inert, and serves chart tiles offline once their blocks have been fetched.

const DB_NAME = 'binnacle-pmtiles-blocks';
const BLOCKS = 'blocks';
const META = 'meta';
const ARCHIVES = 'archives';

const BLOCK_SIZE = 64 * 1024;
const MAX_BYTES = 256 * 1024 * 1024;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// The in-memory fallback (private mode, degraded IndexedDB) keeps a much smaller budget:
// enough for a session's working set without growing the heap toward the archive size.
const MEMORY_MAX_BYTES = 16 * 1024 * 1024;
const WRITES_PER_PRUNE = 16;

interface BlockMeta {
  size: number;
  lastAccess: number;
}

export interface BlockStore {
  getBlocks(archiveUrl: string, indexes: number[]): Promise<Map<number, ArrayBuffer>>;
  putBlocks(archiveUrl: string, blocks: Map<number, ArrayBuffer>, now: number): Promise<void>;
  touch(archiveUrl: string, indexes: number[], now: number): Promise<void>;
  getValidator(archiveUrl: string): Promise<string | undefined>;
  setValidator(archiveUrl: string, validator: string): Promise<void>;
  purgeArchive(archiveUrl: string): Promise<void>;
  // Delete blocks not touched within the TTL, then the oldest-touched blocks beyond the
  // byte budget. Reads only the meta rows, never the block bytes.
  prune(now: number): Promise<void>;
}

export interface BlockStoreOptions {
  maxBytes?: number;
  ttlMs?: number;
  memoryMaxBytes?: number;
  // Pass `factory: undefined` explicitly to force the in-memory fallback (used by tests).
  factory?: IDBFactory;
}

// The key joins on a newline, which cannot appear in a URL, so an archive's block keys
// form a clean prefix set.
function blockKey(archiveUrl: string, index: number): string {
  return `${archiveUrl}\n${index}`;
}

function memoryBlockStore(maxBytes: number, ttlMs: number): BlockStore {
  const blocks = new Map<string, { data: ArrayBuffer; size: number; lastAccess: number }>();
  const validators = new Map<string, string>();
  let total = 0;

  const drop = (key: string): void => {
    const entry = blocks.get(key);
    if (!entry) return;
    blocks.delete(key);
    total -= entry.size;
  };
  const evict = (): void => {
    if (total <= maxBytes) return;
    const oldestFirst = [...blocks.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (const [key] of oldestFirst) {
      if (total <= maxBytes) break;
      drop(key);
    }
  };

  return {
    getBlocks: async (url, indexes) => {
      const out = new Map<number, ArrayBuffer>();
      for (const index of indexes) {
        const entry = blocks.get(blockKey(url, index));
        if (entry) out.set(index, entry.data);
      }
      return out;
    },
    putBlocks: async (url, entries, now) => {
      for (const [index, data] of entries) {
        const key = blockKey(url, index);
        drop(key);
        blocks.set(key, { data, size: data.byteLength, lastAccess: now });
        total += data.byteLength;
      }
      evict();
    },
    touch: async (url, indexes, now) => {
      for (const index of indexes) {
        const entry = blocks.get(blockKey(url, index));
        if (entry) entry.lastAccess = now;
      }
    },
    getValidator: async (url) => validators.get(url),
    setValidator: async (url, validator) => {
      validators.set(url, validator);
    },
    purgeArchive: async (url) => {
      const prefix = `${url}\n`;
      for (const key of blocks.keys()) {
        if (key.startsWith(prefix)) drop(key);
      }
      validators.delete(url);
    },
    prune: async (now) => {
      for (const [key, entry] of blocks) {
        if (now - entry.lastAccess >= ttlMs) drop(key);
      }
      evict();
    },
  };
}

export function createBlockStore(options: BlockStoreOptions = {}): BlockStore {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const ttlMs = options.ttlMs ?? TTL_MS;
  const memoryMaxBytes = options.memoryMaxBytes ?? MEMORY_MAX_BYTES;
  const factory = 'factory' in options ? options.factory : globalThis.indexedDB;
  // Mirror every write to bounded memory so a mid-session degrade keeps the working set.
  const memory = memoryBlockStore(memoryMaxBytes, ttlMs);
  if (!factory) return memory;

  const idb = degradeToMemory();
  const db = openIdbDatabase(factory, DB_NAME, 1, (conn) => {
    conn.createObjectStore(BLOCKS);
    conn.createObjectStore(META);
    conn.createObjectStore(ARCHIVES);
  });

  return {
    getBlocks: (url, indexes) =>
      idb.read(
        async () => {
          const conn = await db();
          const store = conn.transaction(BLOCKS, 'readonly').objectStore(BLOCKS);
          const found = await Promise.all(
            indexes.map((index) =>
              reqPromise<ArrayBuffer | undefined>(store.get(blockKey(url, index))),
            ),
          );
          const out = new Map<number, ArrayBuffer>();
          indexes.forEach((index, at) => {
            const data = found[at];
            if (data) out.set(index, data);
          });
          return out;
        },
        () => memory.getBlocks(url, indexes),
      ),
    putBlocks: (url, entries, now) =>
      idb.write(
        async () => {
          const conn = await db();
          const tx = conn.transaction([BLOCKS, META], 'readwrite');
          for (const [index, data] of entries) {
            const meta: BlockMeta = { size: data.byteLength, lastAccess: now };
            tx.objectStore(BLOCKS).put(data, blockKey(url, index));
            tx.objectStore(META).put(meta, blockKey(url, index));
          }
          await txDone(tx);
        },
        () => memory.putBlocks(url, entries, now),
      ),
    touch: (url, indexes, now) =>
      idb.write(
        async () => {
          const conn = await db();
          const tx = conn.transaction(META, 'readwrite');
          const store = tx.objectStore(META);
          for (const index of indexes) {
            const key = blockKey(url, index);
            const req = store.get(key);
            // A follow-up put issued inside onsuccess stays inside this transaction.
            req.onsuccess = () => {
              const meta = req.result as BlockMeta | undefined;
              if (meta) store.put({ size: meta.size, lastAccess: now }, key);
            };
          }
          await txDone(tx);
        },
        () => memory.touch(url, indexes, now),
      ),
    getValidator: (url) =>
      idb.read(
        async () => {
          const conn = await db();
          const store = conn.transaction(ARCHIVES, 'readonly').objectStore(ARCHIVES);
          return reqPromise<string | undefined>(store.get(url));
        },
        () => memory.getValidator(url),
      ),
    setValidator: (url, validator) =>
      idb.write(
        async () => {
          const conn = await db();
          const tx = conn.transaction(ARCHIVES, 'readwrite');
          tx.objectStore(ARCHIVES).put(validator, url);
          await txDone(tx);
        },
        () => memory.setValidator(url, validator),
      ),
    purgeArchive: (url) =>
      idb.write(
        async () => {
          const conn = await db();
          const metaStore = conn.transaction(META, 'readonly').objectStore(META);
          const keys = await reqPromise<IDBValidKey[]>(metaStore.getAllKeys());
          const prefix = `${url}\n`;
          const mine = keys.map(String).filter((key) => key.startsWith(prefix));
          const tx = conn.transaction([BLOCKS, META, ARCHIVES], 'readwrite');
          for (const key of mine) {
            tx.objectStore(BLOCKS).delete(key);
            tx.objectStore(META).delete(key);
          }
          tx.objectStore(ARCHIVES).delete(url);
          await txDone(tx);
        },
        () => memory.purgeArchive(url),
      ),
    prune: (now) =>
      idb.write(
        async () => {
          const conn = await db();
          const metaStore = conn.transaction(META, 'readonly').objectStore(META);
          // Issue both reads synchronously on the one transaction; awaiting between requests
          // would let the transaction auto-commit and the second request would throw.
          const metasReq = metaStore.getAll();
          const keysReq = metaStore.getAllKeys();
          const [metas, keys] = await Promise.all([
            reqPromise<BlockMeta[]>(metasReq),
            reqPromise<IDBValidKey[]>(keysReq),
          ]);
          const items = keys.map((key, at) => ({ key: String(key), ...metas[at] }));
          const expired = items.filter((item) => now - item.lastAccess >= ttlMs);
          const live = items
            .filter((item) => now - item.lastAccess < ttlMs)
            .sort((a, b) => a.lastAccess - b.lastAccess);
          let total = live.reduce((sum, item) => sum + item.size, 0);
          const evicted: string[] = [];
          for (const item of live) {
            if (total <= maxBytes) break;
            evicted.push(item.key);
            total -= item.size;
          }
          const toDelete = [...expired.map((item) => item.key), ...evicted];
          if (toDelete.length === 0) return;
          const tx = conn.transaction([BLOCKS, META], 'readwrite');
          for (const key of toDelete) {
            tx.objectStore(BLOCKS).delete(key);
            tx.objectStore(META).delete(key);
          }
          await txDone(tx);
        },
        () => memory.prune(now),
      ),
  };
}

export interface BlockCacheOptions {
  // Test seams: production uses the 64 KB block, a 16-write prune cadence, and Date.now.
  blockSize?: number;
  pruneEvery?: number;
  now?: () => number;
}

// Duplicated from pmtiles.ts rather than imported, because pmtiles.ts imports this module
// and a back-import would be a cycle.
function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}

function toRuns(indexes: number[]): Array<{ start: number; count: number }> {
  const runs: Array<{ start: number; count: number }> = [];
  for (const index of indexes) {
    const last = runs[runs.length - 1];
    if (last && index === last.start + last.count) last.count += 1;
    else runs.push({ start: index, count: 1 });
  }
  return runs;
}

// A pmtiles Source that serves aligned blocks cache-first from a BlockStore, fetching
// misses through the inner source as one coalesced range per contiguous run. The block
// holding the archive header is network-first so a replaced archive is detected by its
// strong validator and purged; when that fetch fails the cached block serves (offline).
export class BlockCachedSource implements Source {
  #inner: Source;
  #store: BlockStore;
  #blockSize: number;
  #pruneEvery: number;
  #now: () => number;
  #writesSincePrune = 0;
  #etag: string | undefined;
  #etagLoaded = false;

  constructor(inner: Source, store: BlockStore, options: BlockCacheOptions = {}) {
    this.#inner = inner;
    this.#store = store;
    this.#blockSize = options.blockSize ?? BLOCK_SIZE;
    this.#pruneEvery = options.pruneEvery ?? WRITES_PER_PRUNE;
    this.#now = options.now ?? Date.now;
  }

  getKey(): string {
    return this.#inner.getKey();
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string,
  ): Promise<RangeResponse> {
    const bs = this.#blockSize;
    const url = this.#inner.getKey();
    const first = Math.floor(offset / bs);
    const last = Math.floor((offset + length - 1) / bs);
    const indexes: number[] = [];
    for (let index = first; index <= last; index++) indexes.push(index);

    const cached = await this.#store.getBlocks(url, indexes);
    const fetched = new Map<number, ArrayBuffer>();
    let cacheControl: string | undefined;
    let expires: string | undefined;

    if (first === 0) {
      try {
        const res = await this.#inner.getBytes(0, bs, signal, etag);
        if (res.etag !== undefined) {
          const prior = await this.#store.getValidator(url);
          if (prior !== undefined && prior !== res.etag) {
            // The archive was replaced: every cached block is from the old bytes.
            await this.#store.purgeArchive(url);
            cached.clear();
          }
          if (prior !== res.etag) await this.#store.setValidator(url, res.etag);
          this.#etag = res.etag;
          this.#etagLoaded = true;
        }
        fetched.set(0, res.data);
        cached.set(0, res.data);
        cacheControl = res.cacheControl;
        expires = res.expires;
      } catch (error) {
        if (!cached.has(0) || isAbort(error, signal)) throw error;
      }
    }

    // A cached short block marks the archive tail: nothing past it exists, so a request
    // running beyond it truncates (as a raw range read would) instead of fetching a range
    // that is fully past the end and would be refused.
    let tail = Number.POSITIVE_INFINITY;
    for (const [index, data] of cached) {
      if (data.byteLength < bs) tail = Math.min(tail, index);
    }
    const missing = indexes.filter((index) => !cached.has(index) && index < tail);
    const runs = toRuns(missing);
    const responses = await Promise.all(
      runs.map((run) => this.#inner.getBytes(run.start * bs, run.count * bs, signal, etag)),
    );
    responses.forEach((res, at) => {
      const run = runs[at];
      for (let k = 0; k < run.count; k++) {
        const from = k * bs;
        // A run can come back short when it reaches the end of the archive; the tail
        // block stores its actual bytes, unpadded, and anything past it stores nothing.
        if (from >= res.data.byteLength) break;
        const block = res.data.slice(from, Math.min(from + bs, res.data.byteLength));
        fetched.set(run.start + k, block);
        cached.set(run.start + k, block);
      }
      cacheControl ??= res.cacheControl;
      expires ??= res.expires;
    });

    const now = this.#now();
    if (fetched.size > 0) {
      await this.#store.putBlocks(url, fetched, now);
      this.#writesSincePrune += fetched.size;
      if (this.#writesSincePrune >= this.#pruneEvery) {
        this.#writesSincePrune = 0;
        void this.#store.prune(now);
      }
    }
    const hits = indexes.filter((index) => cached.has(index) && !fetched.has(index));
    if (hits.length > 0) void this.#store.touch(url, hits, now);

    return {
      data: this.#assemble(cached, first, last, offset, length),
      etag: await this.#archiveEtag(url),
      cacheControl,
      expires,
    };
  }

  // The exact requested sub-range, copied out of the covered blocks. Only the archive's
  // tail block is short, so assembly stops at the first gap or short block, truncating a
  // read past the end of the archive to what a raw range request would have returned.
  #assemble(
    blocks: Map<number, ArrayBuffer>,
    first: number,
    last: number,
    offset: number,
    length: number,
  ): ArrayBuffer {
    const bs = this.#blockSize;
    const lead = offset - first * bs;
    const out = new Uint8Array(length);
    let filled = 0;
    for (let index = first; index <= last; index++) {
      const block = blocks.get(index);
      if (!block) break;
      const blockStart = (index - first) * bs;
      const from = Math.max(lead, blockStart);
      const to = Math.min(lead + length, blockStart + block.byteLength);
      if (to <= from) break;
      out.set(new Uint8Array(block, from - blockStart, to - from), from - lead);
      filled = to - lead;
      if (block.byteLength < bs) break;
    }
    return filled === length ? out.buffer : out.buffer.slice(0, filled);
  }

  async #archiveEtag(url: string): Promise<string | undefined> {
    if (!this.#etagLoaded) {
      this.#etag = await this.#store.getValidator(url);
      this.#etagLoaded = true;
    }
    return this.#etag;
  }
}
