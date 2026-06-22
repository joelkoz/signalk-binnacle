import { describe, expect, it, vi } from 'vitest';
import type { HistoryProviders } from '$shared/signalk';
import type { TimeTravelData } from './time-travel-client';
import { TimeTravelStore } from './time-travel-store.svelte';

const providers: HistoryProviders = { ids: ['p'] };
const data: TimeTravelData = {
  from: 0,
  to: 6000,
  samples: [
    { t: 0, lon: 1, lat: 1, depth: 4 },
    { t: 6000, lon: 2, lat: 2, depth: 5 },
  ],
};

function make(
  load: () => Promise<TimeTravelData | undefined>,
  prov: () => HistoryProviders | undefined = () => providers,
) {
  return new TimeTravelStore('http://x', () => 't', prov, { load });
}

describe('TimeTravelStore', () => {
  it('enters, loads, and starts scrub at the latest sample', async () => {
    const store = make(() => Promise.resolve(data));
    await store.enter();
    expect(store.active).toBe(true);
    expect(store.status).toBe('ready');
    expect(store.from).toBe(0);
    expect(store.to).toBe(6000);
    expect(store.scrubMs).toBe(6000);
    expect(store.current?.t).toBe(6000);
  });

  it('sets no-provider without querying when providers is undefined', async () => {
    const load = vi.fn();
    const store = make(load as never, () => undefined);
    await store.enter();
    expect(store.status).toBe('no-provider');
    expect(load).not.toHaveBeenCalled();
  });

  it('reports empty when the provider returns no samples', async () => {
    const store = make(() => Promise.resolve({ from: 0, to: 0, samples: [] }));
    await store.enter();
    expect(store.status).toBe('empty');
  });

  it('reports failed when the load is undefined', async () => {
    const store = make(() => Promise.resolve(undefined));
    await store.enter();
    expect(store.status).toBe('failed');
  });

  it('clamps scrub to the range', async () => {
    const store = make(() => Promise.resolve(data));
    await store.enter();
    store.setScrub(-100);
    expect(store.scrubMs).toBe(0);
    store.setScrub(99999);
    expect(store.scrubMs).toBe(6000);
  });

  it('exit clears state', async () => {
    const store = make(() => Promise.resolve(data));
    await store.enter();
    store.exit();
    expect(store.active).toBe(false);
    expect(store.status).toBe('idle');
    expect(store.samples).toEqual([]);
  });

  it('ignores a stale load that resolves after a newer one', async () => {
    let resolveFirst: (d: TimeTravelData) => void = () => {};
    const first = new Promise<TimeTravelData>((r) => (resolveFirst = r));
    const load = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ...data, to: 9000, samples: [{ t: 9000, lon: 3, lat: 3 }] });
    const store = make(load as never);
    const p1 = store.enter();
    const p2 = store.reload();
    resolveFirst(data);
    await Promise.all([p1, p2]);
    expect(store.to).toBe(9000);
  });
});
