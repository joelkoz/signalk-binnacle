import { describe, expect, it } from 'vitest';
import type { OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createNotesOverlay } from './notes-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('notes overlay', () => {
  it('adds clustered, count, symbol, and selection layers in the routes band', async () => {
    const overlay = createNotesOverlay('http://pi', undefined);
    const map = createFakeMap();
    await overlay.add(ctxFor(map));
    expect(overlay.band).toBe('routes');
    expect(overlay.title).toBe('Points of interest');
    // The note source (clustered) plus the selection-ring source.
    expect(map.sources.size).toBe(2);
    expect(map.layers.has('binnacle-notes-symbol')).toBe(true);
    expect(map.layers.has('binnacle-notes-cluster')).toBe(true);
    expect(map.layers.has('binnacle-notes-cluster-count')).toBe(true);
    expect(map.layers.has('binnacle-notes-selected')).toBe(true);
  });

  it('exposes deselect to clear the selection ring', () => {
    const overlay = createNotesOverlay('http://pi', undefined);
    expect(typeof overlay.deselect).toBe('function');
  });
});
