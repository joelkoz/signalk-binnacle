import { describe, expect, it } from 'vitest';
import type { OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createNotesOverlay, safeHttpUrl } from './notes-overlay';

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

describe('safeHttpUrl', () => {
  it('keeps http and https links', () => {
    expect(safeHttpUrl('https://example.org/x')).toBe('https://example.org/x');
    expect(safeHttpUrl('http://pi/notes/1')).toBe('http://pi/notes/1');
  });

  it('rejects javascript, data, and unparseable urls', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHttpUrl('not a url')).toBeUndefined();
    expect(safeHttpUrl('')).toBeUndefined();
  });
});
