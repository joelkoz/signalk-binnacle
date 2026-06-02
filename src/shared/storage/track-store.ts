// A small append log generic over the record type so this stays domain-free (the track point
// shape lives in entities/track). It degrades to an in-memory log, and never throws, when
// IndexedDB is missing (Node, private mode) or fails to open or write (blocked upgrade, quota,
// corruption), so a persistence failure never breaks recording.

export interface TrackStore<T> {
  all(): Promise<T[]>;
  append(item: T): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'binnacle';
const STORE = 'track-points';

function memoryStore<T>(): TrackStore<T> {
  let items: T[] = [];
  return {
    all: async () => items.slice(),
    append: async (item) => {
      items.push(item);
    },
    clear: async () => {
      items = [];
    },
  };
}

export function createTrackStore<T>(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): TrackStore<T> {
  if (!factory) return memoryStore<T>();

  const memory = memoryStore<T>();
  let degraded = false;

  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        // A second tab holding the prior version blocks the upgrade; reject instead of hanging.
        req.onblocked = () => reject(new Error('indexedDB open blocked'));
      });
    }
    return dbPromise;
  };

  const run = <R>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<R> =>
    db().then(
      (conn) =>
        new Promise<R>((resolve, reject) => {
          const req = op(conn.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as R);
          req.onerror = () => reject(req.error);
        }),
    );

  return {
    all: async () => {
      if (degraded) return memory.all();
      try {
        return await run<T[]>('readonly', (s) => s.getAll());
      } catch {
        degraded = true;
        return memory.all();
      }
    },
    append: async (item) => {
      if (degraded) return memory.append(item);
      try {
        await run('readwrite', (s) => s.add(item));
      } catch {
        degraded = true;
        await memory.append(item);
      }
    },
    clear: async () => {
      if (degraded) return memory.clear();
      try {
        await run('readwrite', (s) => s.clear());
      } catch {
        degraded = true;
        await memory.clear();
      }
    },
  };
}
