import { describe, expect, it, vi } from 'vitest';
import type { PmtilesStore } from '$shared/storage';
import { UserCharts } from './user-charts.svelte';

// The entity reads PMTiles metadata through $shared/map; stub it so the test does not need a real
// archive. The descriptor's name defaults to this meta name unless the commit overrides it.
vi.mock('$shared/map', () => ({
  readPmtilesMeta: vi.fn(async () => ({
    name: 'Meta name',
    kind: 'vector' as const,
    bounds: [0, 0, 1, 1] as [number, number, number, number],
    minzoom: 0,
    maxzoom: 10,
    vectorLayers: ['water'],
    byteSize: 2048,
  })),
}));

function fakeStore(): { store: PmtilesStore; blobs: Map<string, Blob> } {
  const blobs = new Map<string, Blob>();
  return {
    blobs,
    store: {
      put: async (id, blob) => {
        blobs.set(id, blob);
      },
      get: async (id) => blobs.get(id),
      delete: async (id) => {
        blobs.delete(id);
      },
      keys: async () => [...blobs.keys()],
    },
  };
}

describe('UserCharts stage, commit, and remove', () => {
  it('stages a URL chart without saving, then commits with the edited name', async () => {
    const { store } = fakeStore();
    const charts = new UserCharts(store, [], () => {});
    const draft = await charts.stageUrl('https://example.com/chart.pmtiles');
    // Staging does not save: the source list is still empty.
    expect(charts.sources).toHaveLength(0);
    expect(draft.source.name).toBe('Meta name');
    expect(draft.source.origin).toEqual({ type: 'url', url: 'https://example.com/chart.pmtiles' });

    await charts.commit(draft, 'My coastal chart');
    expect(charts.sources).toHaveLength(1);
    expect(charts.sources[0].name).toBe('My coastal chart');
  });

  it('stages a file chart and stores the blob only on commit, with an empty name falling back', async () => {
    const { store, blobs } = fakeStore();
    const charts = new UserCharts(store, [], () => {});
    const file = new File([new Uint8Array([1, 2, 3])], 'harbor.pmtiles');
    const draft = await charts.stageFile(file);
    // The blob is held in the draft, not stored yet.
    expect(blobs.size).toBe(0);

    await charts.commit(draft, '   ');
    // A blank name falls back to the metadata name.
    expect(charts.sources[0].name).toBe('Meta name');
    const origin = charts.sources[0].origin;
    expect(origin.type).toBe('file');
    if (origin.type === 'file') expect(blobs.has(origin.storeId)).toBe(true);
  });

  it('removes the descriptor and the stored blob', async () => {
    const { store, blobs } = fakeStore();
    const charts = new UserCharts(store, [], () => {});
    const draft = await charts.stageFile(new File([new Uint8Array([9])], 'reef.pmtiles'));
    await charts.commit(draft, 'Reef');
    const { id, origin } = charts.sources[0];
    const storeId = origin.type === 'file' ? origin.storeId : '';
    expect(blobs.has(storeId)).toBe(true);

    await charts.remove(id);
    expect(charts.sources).toHaveLength(0);
    expect(blobs.has(storeId)).toBe(false);
  });

  it('persists on commit and on remove', async () => {
    const { store } = fakeStore();
    const snapshots: number[] = [];
    const charts = new UserCharts(store, [], (sources) => snapshots.push(sources.length));
    const draft = await charts.stageUrl('https://example.com/a.pmtiles');
    await charts.commit(draft, 'A');
    await charts.remove(charts.sources[0]?.id ?? '');
    expect(snapshots).toEqual([1, 0]);
  });

  it('fires onAdd on commit and onRemove on remove (the server-sync hooks)', async () => {
    const { store } = fakeStore();
    const added: string[] = [];
    const removed: string[] = [];
    const charts = new UserCharts(
      store,
      [],
      () => {},
      (source) => added.push(source.id),
      (source) => removed.push(source.id),
    );
    const draft = await charts.stageUrl('https://example.com/x.pmtiles');
    await charts.commit(draft, 'X');
    const id = charts.sources[0].id;
    await charts.remove(id);
    expect(added).toEqual([id]);
    expect(removed).toEqual([id]);
  });

  it('reconcile deletes orphaned blobs and keeps referenced and URL charts', async () => {
    const { store, blobs } = fakeStore();
    blobs.set('referenced', new Blob(['a']));
    blobs.set('orphan', new Blob(['b']));
    const charts = new UserCharts(
      store,
      [
        { id: 'c1', name: 'Kept', kind: 'vector', origin: { type: 'file', storeId: 'referenced' } },
        {
          id: 'c2',
          name: 'Url',
          kind: 'vector',
          origin: { type: 'url', url: 'https://x/y.pmtiles' },
        },
      ],
      () => {},
    );
    await charts.reconcile();
    expect(blobs.has('referenced')).toBe(true);
    expect(blobs.has('orphan')).toBe(false);
  });
});
