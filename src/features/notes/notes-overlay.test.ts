import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { fetchNotes, type NotePoint } from './notes-client';
import { createNotesOverlay } from './notes-overlay';

vi.mock('./notes-client', () => ({ fetchNotes: vi.fn() }));
const fetchNotesMock = vi.mocked(fetchNotes);

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

// A minimal viewport-only ctx for sync tests: a 2 by 2 degree view around a mutable center, so a
// test pans the map by mutating the state object.
function viewCtx(state: { zoom: number; lng: number; lat: number }): OverlayContext {
  const map = {
    getZoom: () => state.zoom,
    getCenter: () => ({ lng: state.lng, lat: state.lat }),
    getBounds: () => ({
      getWest: () => state.lng - 1,
      getSouth: () => state.lat - 1,
      getEast: () => state.lng + 1,
      getNorth: () => state.lat + 1,
    }),
    getSource: () => undefined,
  };
  return { map: map as never, beforeIdFor: () => undefined };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

beforeEach(() => {
  fetchNotesMock.mockReset();
});

describe('notes overlay', () => {
  it('adds the cluster ring, icon, count, point, and selection layers in the routes band', async () => {
    const overlay = createNotesOverlay('http://pi', undefined);
    const map = createFakeMap();
    await overlay.add(ctxFor(map));
    expect(overlay.band).toBe('routes');
    expect(overlay.title).toBe('Points of interest');
    // The note source (clustered) plus the selection-ring source.
    expect(map.sources.size).toBe(2);
    expect(map.layers.has('binnacle-notes-symbol')).toBe(true);
    expect(map.layers.has('binnacle-notes-cluster-ring')).toBe(true);
    expect(map.layers.has('binnacle-notes-cluster-icon')).toBe(true);
    expect(map.layers.has('binnacle-notes-cluster-count')).toBe(true);
    expect(map.layers.has('binnacle-notes-selected')).toBe(true);
    expect(map.layers.has('binnacle-notes-selected-casing')).toBe(true);
  });

  it('exposes deselect to clear the selection ring', () => {
    const overlay = createNotesOverlay('http://pi', undefined);
    expect(typeof overlay.deselect).toBe('function');
  });

  it('refetches after an in-flight fetch settles for an area the map has left', async () => {
    let resolveFetch!: (notes: NotePoint[] | undefined) => void;
    fetchNotesMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    fetchNotesMock.mockResolvedValue([]);
    const overlay = createNotesOverlay('http://pi', undefined);
    const state = { zoom: 12, lng: 0, lat: 0 };
    const ctx = viewCtx(state);
    overlay.sync(ctx);
    state.lng = 30;
    overlay.sync(ctx); // in-flight guard: no second fetch yet
    expect(fetchNotesMock).toHaveBeenCalledTimes(1);
    resolveFetch([]);
    await settle();
    // The map is now stationary at the new center, so without the fast-path reset this sync
    // would skip and the overlay would keep showing the old area forever.
    overlay.sync(ctx);
    expect(fetchNotesMock).toHaveBeenCalledTimes(2);
  });

  it('retries a failed fetch on a stationary map once the cooldown passes', async () => {
    vi.useFakeTimers();
    try {
      fetchNotesMock.mockResolvedValue(undefined);
      const overlay = createNotesOverlay('http://pi', undefined);
      const ctx = viewCtx({ zoom: 12, lng: 0, lat: 0 });
      overlay.sync(ctx);
      expect(fetchNotesMock).toHaveBeenCalledTimes(1);
      await settle();
      overlay.sync(ctx); // still cooling down: no refetch
      expect(fetchNotesMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(31_000);
      overlay.sync(ctx); // cooldown passed: retried without the map moving
      expect(fetchNotesMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
