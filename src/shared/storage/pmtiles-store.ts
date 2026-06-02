// A persistent blob store for user-uploaded PMTiles archives, keyed by id. IndexedDB stores the
// Blob natively. It degrades to an in-memory map, and never throws, when IndexedDB is missing
// (Node, SSR, non-secure context, private mode) or fails to open or write (blocked upgrade,
// quota, corruption), so a persistence failure never breaks the offline-region workflow.

export interface PmtilesStore {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
  // Every stored archive's id and byte size, for the layers panel list and the delete confirm.
  list(): Promise<Array<{ id: string; byteSize: number }>>;
  totalBytes(): Promise<number>;
}

const DB_NAME = 'binnacle-pmtiles';
const STORE = 'archives';

function memoryStore(): PmtilesStore {
  const blobs = new Map<string, Blob>();
  return {
    put: async (id, blob) => {
      blobs.set(id, blob);
    },
    get: async (id) => blobs.get(id),
    delete: async (id) => {
      blobs.delete(id);
    },
    list: async () => [...blobs].map(([id, blob]) => ({ id, byteSize: blob.size })),
    totalBytes: async () => {
      let total = 0;
      for (const blob of blobs.values()) total += blob.size;
      return total;
    },
  };
}

export function createPmtilesStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): PmtilesStore {
  if (!factory) return memoryStore();

  const memory = memoryStore();
  let degraded = false;

  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
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
    put: async (id, blob) => {
      if (degraded) return memory.put(id, blob);
      await memory.put(id, blob);
      try {
        await run('readwrite', (s) => s.put(blob, id));
      } catch {
        degraded = true;
      }
    },
    get: async (id) => {
      if (degraded) return memory.get(id);
      try {
        return await run<Blob | undefined>('readonly', (s) => s.get(id));
      } catch {
        degraded = true;
        return memory.get(id);
      }
    },
    delete: async (id) => {
      if (degraded) return memory.delete(id);
      await memory.delete(id);
      try {
        await run('readwrite', (s) => s.delete(id));
      } catch {
        degraded = true;
      }
    },
    list: async () => {
      if (degraded) return memory.list();
      try {
        const [ids, blobs] = await Promise.all([
          run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),
          run<Blob[]>('readonly', (s) => s.getAll()),
        ]);
        return ids.map((key, i) => ({ id: String(key), byteSize: blobs[i].size }));
      } catch {
        degraded = true;
        return memory.list();
      }
    },
    totalBytes: async () => {
      if (degraded) return memory.totalBytes();
      try {
        const blobs = await run<Blob[]>('readonly', (s) => s.getAll());
        let total = 0;
        for (const blob of blobs) total += blob.size;
        return total;
      } catch {
        degraded = true;
        return memory.totalBytes();
      }
    },
  };
}
