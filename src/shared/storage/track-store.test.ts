import { describe, expect, it } from 'vitest';
import { createTrackStore } from './track-store';

interface Point {
  t: number;
}

describe('createTrackStore (in-memory fallback when indexedDB is absent)', () => {
  it('appends, reads all, and clears', async () => {
    const store = createTrackStore<Point>(undefined);
    await store.append({ t: 1 });
    await store.append({ t: 2 });
    expect((await store.all()).map((x) => x.t)).toEqual([1, 2]);
    await store.clear();
    expect(await store.all()).toEqual([]);
  });

  it('replace swaps the whole log', async () => {
    const store = createTrackStore<Point>(undefined);
    await store.append({ t: 1 });
    await store.replace([{ t: 5 }, { t: 6 }]);
    expect((await store.all()).map((x) => x.t)).toEqual([5, 6]);
  });
});
