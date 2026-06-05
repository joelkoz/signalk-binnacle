import { degradeToMemory, openIdbStore } from './idb';

// A persistent blob store for user-uploaded PMTiles archives, keyed by id. IndexedDB stores the
// Blob natively. It degrades to an in-memory map, and never throws, when IndexedDB is missing
// (Node, SSR, non-secure context, private mode) or fails to open or write (blocked upgrade,
// quota, corruption), so a persistence failure never breaks the offline-region workflow.

export interface PmtilesStore {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
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
  };
}

export function createPmtilesStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): PmtilesStore {
  if (!factory) return memoryStore();

  const memory = memoryStore();
  const { run } = openIdbStore(factory, DB_NAME, STORE, (db) => db.createObjectStore(STORE));
  const idb = degradeToMemory();

  return {
    put: (id, blob) =>
      idb.write(
        () => run('readwrite', (s) => s.put(blob, id)),
        () => memory.put(id, blob),
      ),
    get: (id) =>
      idb.read<Blob | undefined>(
        () => run<Blob | undefined>('readonly', (s) => s.get(id)),
        () => memory.get(id),
      ),
    delete: (id) =>
      idb.write(
        () => run('readwrite', (s) => s.delete(id)),
        () => memory.delete(id),
      ),
  };
}
