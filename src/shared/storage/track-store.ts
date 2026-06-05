import { degradeToMemory, openIdbStore } from './idb';

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
  const { run } = openIdbStore(factory, DB_NAME, STORE, (db) =>
    db.createObjectStore(STORE, { autoIncrement: true }),
  );
  const idb = degradeToMemory();

  return {
    all: () =>
      idb.read<T[]>(
        () => run<T[]>('readonly', (s) => s.getAll()),
        () => memory.all(),
      ),
    append: (item) =>
      idb.write(
        () => run('readwrite', (s) => s.add(item)),
        () => memory.append(item),
      ),
    clear: () =>
      idb.write(
        () => run('readwrite', (s) => s.clear()),
        () => memory.clear(),
      ),
  };
}
