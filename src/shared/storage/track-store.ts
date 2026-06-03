import { openIdbStore } from './idb';

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
  const { run } = openIdbStore(factory, DB_NAME, STORE, (db) =>
    db.createObjectStore(STORE, { autoIncrement: true }),
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
    // Mirror to memory on every write, so if IndexedDB degrades mid-session the in-memory log
    // still holds the records appended before the failure, not only the ones after it.
    append: async (item) => {
      if (degraded) return memory.append(item);
      await memory.append(item);
      try {
        await run('readwrite', (s) => s.add(item));
      } catch {
        degraded = true;
      }
    },
    clear: async () => {
      if (degraded) return memory.clear();
      await memory.clear();
      try {
        await run('readwrite', (s) => s.clear());
      } catch {
        degraded = true;
      }
    },
  };
}
