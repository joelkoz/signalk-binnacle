import { describe, expect, it } from 'vitest';
import { createExpiringStore } from './expiring-store';

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

describe('createExpiringStore', () => {
  it('puts and gets a value with its expiry (in-memory fallback)', async () => {
    const store = createExpiringStore<{ n: number }>('test', { factory: undefined });
    await store.put('a', { n: 1 }, 1000);
    expect(await store.get('a')).toEqual({ value: { n: 1 }, expires: 1000 });
    expect(await store.get('missing')).toBeUndefined();
  });

  it('prunes expired entries and caps the live entries to maxEntries', async () => {
    const store = createExpiringStore<number>('test', { factory: undefined, maxEntries: 2 });
    await store.put('expired', 0, 500);
    await store.put('a', 1, 2000);
    await store.put('b', 2, 3000);
    await store.put('c', 3, 4000);

    await store.prune(1000); // now=1000: 'expired' is gone, and only the 2 newest live entries remain

    expect(await store.get('expired')).toBeUndefined();
    expect(await store.get('a')).toBeUndefined(); // oldest live entry, evicted by the cap
    expect((await store.get('b'))?.value).toBe(2);
    expect((await store.get('c'))?.value).toBe(3);
  });

  it('degrades to memory when indexedDB fails to open, never throwing', async () => {
    const store = createExpiringStore<number>('test', { factory: failingFactory() });
    await store.put('a', 7, 1000);
    expect((await store.get('a'))?.value).toBe(7);
    await store.prune(2000);
    expect(await store.get('a')).toBeUndefined(); // expired and pruned
  });
});
