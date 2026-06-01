import { describe, expect, it } from 'vitest';
import type { OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createNotesOverlay } from './notes-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('notes overlay', () => {
  it('adds a source and a symbol layer in the routes band', async () => {
    const overlay = createNotesOverlay('http://pi', undefined);
    const map = createFakeMap();
    await overlay.add(ctxFor(map));
    expect(overlay.band).toBe('routes');
    expect(overlay.title).toBe('Points of interest');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });
});
