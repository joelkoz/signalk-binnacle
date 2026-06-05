import { degradeToMemory, openIdbDatabase } from './idb';

// A persistent, time-to-live key-value store backed by IndexedDB, for caching fetched data across
// reloads and over plain HTTP. CacheStorage and service workers are secure-context only (so they are
// inert when the server is served over plain http on a LAN), but IndexedDB is not, so this is the
// http-friendly persistence layer. Values are stored by structured clone, so any cloneable value
// works. Each value's expiry is kept in a separate small object store, so pruning reads only the
// expiries and never has to load the (potentially large) values. It degrades to an in-memory map,
// and never throws, when IndexedDB is missing (Node, SSR, private mode) or fails (blocked upgrade,
// quota, corruption), so a persistence failure never breaks the caller.

export interface ExpiringEntry<T> {
  value: T;
  expires: number;
}

export interface ExpiringStore<T> {
  get(key: string): Promise<ExpiringEntry<T> | undefined>;
  put(key: string, value: T, expires: number): Promise<void>;
  // Delete every expired entry, and the oldest live entries beyond maxEntries.
  prune(now: number): Promise<void>;
}

interface Options {
  maxEntries?: number;
  // Pass `factory: undefined` explicitly to force the in-memory fallback (used by tests).
  factory?: IDBFactory;
}

const VALUES = 'values';
const META = 'meta';
const DEFAULT_MAX = 48;

function reqPromise<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function memoryStore<T>(maxEntries: number): ExpiringStore<T> {
  const map = new Map<string, ExpiringEntry<T>>();
  return {
    get: async (key) => map.get(key),
    put: async (key, value, expires) => {
      map.set(key, { value, expires });
    },
    prune: async (now) => {
      for (const [k, e] of map) if (e.expires <= now) map.delete(k);
      if (map.size > maxEntries) {
        const oldestFirst = [...map.entries()].sort((a, b) => a[1].expires - b[1].expires);
        for (const [k] of oldestFirst.slice(0, map.size - maxEntries)) map.delete(k);
      }
    },
  };
}

export function createExpiringStore<T>(dbName: string, options: Options = {}): ExpiringStore<T> {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX;
  const factory = 'factory' in options ? options.factory : globalThis.indexedDB;
  if (!factory) return memoryStore<T>(maxEntries);

  // Mirror to memory so a mid-session degrade keeps what was cached so far, and so a read right after
  // a write does not depend on the IndexedDB round-trip.
  const memory = memoryStore<T>(maxEntries);
  const idb = degradeToMemory();
  const db = openIdbDatabase(factory, dbName, 1, (conn) => {
    conn.createObjectStore(VALUES);
    conn.createObjectStore(META);
  });

  return {
    get: (key) =>
      idb.read<ExpiringEntry<T> | undefined>(
        async () => {
          const conn = await db();
          // Issue both reads synchronously on the one transaction; awaiting between requests would
          // let the transaction auto-commit and the second request would throw.
          const tx = conn.transaction([VALUES, META], 'readonly');
          const metaReq = tx.objectStore(META).get(key);
          const valueReq = tx.objectStore(VALUES).get(key);
          const [expires, value] = await Promise.all([
            reqPromise<number | undefined>(metaReq),
            reqPromise<T | undefined>(valueReq),
          ]);
          if (expires === undefined || value === undefined) return undefined;
          return { value, expires };
        },
        () => memory.get(key),
      ),
    put: (key, value, expires) =>
      idb.write(
        async () => {
          const conn = await db();
          const tx = conn.transaction([VALUES, META], 'readwrite');
          tx.objectStore(VALUES).put(value, key);
          tx.objectStore(META).put(expires, key);
          await txDone(tx);
        },
        () => memory.put(key, value, expires),
      ),
    prune: (now) =>
      idb.write(
        async () => {
          const conn = await db();
          const readTx = conn.transaction(META, 'readonly');
          const expiriesReq = readTx.objectStore(META).getAll();
          const keysReq = readTx.objectStore(META).getAllKeys();
          const [expiries, keys] = await Promise.all([
            reqPromise<number[]>(expiriesReq),
            reqPromise<IDBValidKey[]>(keysReq),
          ]);
          const items = keys.map((k, i) => ({ key: String(k), expires: expiries[i] }));
          const expired = items.filter((it) => it.expires <= now).map((it) => it.key);
          const live = items.filter((it) => it.expires > now).sort((a, b) => a.expires - b.expires);
          const overflow =
            live.length > maxEntries
              ? live.slice(0, live.length - maxEntries).map((it) => it.key)
              : [];
          const toDelete = [...expired, ...overflow];
          if (toDelete.length === 0) return;
          const writeTx = conn.transaction([VALUES, META], 'readwrite');
          for (const k of toDelete) {
            writeTx.objectStore(VALUES).delete(k);
            writeTx.objectStore(META).delete(k);
          }
          await txDone(writeTx);
        },
        () => memory.prune(now),
      ),
  };
}
