// A small append log persisted in IndexedDB, generic over the record type so this stays
// domain-free infra (the track point shape lives in entities/track). Node and private-mode
// browsers have no indexedDB, so it falls back to an in-memory log and never throws.

export interface TrackStore<T> {
  all(): Promise<T[]>;
  append(item: T): Promise<void>;
  replace(items: T[]): Promise<void>;
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
    replace: async (next) => {
      items = next.slice();
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

  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  };

  const request = <R>(
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => IDBRequest,
  ): Promise<R> =>
    db().then(
      (conn) =>
        new Promise<R>((resolve, reject) => {
          const req = run(conn.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as R);
          req.onerror = () => reject(req.error);
        }),
    );

  return {
    all: () => request<T[]>('readonly', (s) => s.getAll()),
    append: async (item) => {
      await request('readwrite', (s) => s.add(item));
    },
    replace: (next) =>
      db().then(
        (conn) =>
          new Promise<void>((resolve, reject) => {
            const t = conn.transaction(STORE, 'readwrite');
            const s = t.objectStore(STORE);
            s.clear();
            for (const item of next) s.add(item);
            t.oncomplete = () => resolve();
            t.onerror = () => reject(t.error);
          }),
      ),
    clear: async () => {
      await request('readwrite', (s) => s.clear());
    },
  };
}
