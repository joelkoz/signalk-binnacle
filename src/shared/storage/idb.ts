// The IndexedDB plumbing shared by the stores: a lazy single-store database opener (version 1,
// rejecting rather than hanging when a second tab blocks the upgrade) and a typed transaction
// runner. Each store layers its own degrade-to-memory policy on top.

export interface IdbRunner {
  run<R>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<R>;
}

export function openIdbStore(
  factory: IDBFactory,
  dbName: string,
  storeName: string,
  createStore: (db: IDBDatabase) => void,
): IdbRunner {
  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = factory.open(dbName, 1);
        req.onupgradeneeded = () => createStore(req.result);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        // A second tab holding the prior version blocks the upgrade; reject instead of hanging.
        req.onblocked = () => reject(new Error('indexedDB open blocked'));
      });
    }
    return dbPromise;
  };

  return {
    run: <R>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<R> =>
      db().then(
        (conn) =>
          new Promise<R>((resolve, reject) => {
            const req = op(conn.transaction(storeName, mode).objectStore(storeName));
            req.onsuccess = () => resolve(req.result as R);
            req.onerror = () => reject(req.error);
          }),
      ),
  };
}
