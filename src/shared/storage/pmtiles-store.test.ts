import { describe, expect, it } from 'vitest';
import { createPmtilesStore } from './pmtiles-store';

// An IDBFactory whose open() always errors, to exercise the degrade-to-memory path.
function failingFactory(): IDBFactory {
  return {
    open() {
      const req = { onerror: null as null | (() => void), error: new Error('open failed') };
      queueMicrotask(() => req.onerror?.());
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

function blob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

describe('createPmtilesStore', () => {
  it('puts, gets, and deletes with the in-memory fallback (no indexedDB)', async () => {
    const store = createPmtilesStore(undefined);

    await store.put('region-a', blob(10));
    await store.put('region-b', blob(25));
    expect((await store.get('region-a'))?.size).toBe(10);

    await store.delete('region-a');
    expect(await store.get('region-a')).toBeUndefined();
    expect((await store.get('region-b'))?.size).toBe(25);
  });

  it('round-trips a blob byte-for-byte through put then get', async () => {
    const store = createPmtilesStore(undefined);
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);

    await store.put('archive', original);
    const restored = await store.get('archive');

    expect(restored).toBeDefined();
    expect(new Uint8Array(await (restored as Blob).arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  it('degrades to an in-memory map when indexedDB fails to open, never throwing', async () => {
    const store = createPmtilesStore(failingFactory());

    await store.put('region-a', blob(12));
    expect((await store.get('region-a'))?.size).toBe(12);

    await store.delete('region-a');
    expect(await store.get('region-a')).toBeUndefined();
  });
});
