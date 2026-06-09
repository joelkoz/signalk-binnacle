import { describe, expect, it } from 'vitest';
import { bboxContains, NotesCache, padBbox } from './notes-cache';
import type { Bbox, NotePoint } from './notes-client';

const note = (id: string): NotePoint => ({
  id,
  name: id,
  position: { latitude: 0, longitude: 0 },
  category: 'generic',
});

describe('padBbox', () => {
  it('expands the box outward by the fraction', () => {
    expect(padBbox([0, 0, 10, 10], 0.5)).toEqual([-5, -5, 15, 15]);
  });

  it('clamps to the world and the mercator latitude limit', () => {
    expect(padBbox([-179, -84, 179, 84], 1)).toEqual([-180, -85, 180, 85]);
  });
});

describe('bboxContains', () => {
  it('is true when outer fully surrounds inner', () => {
    expect(bboxContains([-5, -5, 15, 15], [0, 0, 10, 10])).toBe(true);
  });

  it('is false when inner spills past any edge', () => {
    expect(bboxContains([0, 0, 10, 10], [-1, 0, 10, 10])).toBe(false);
    expect(bboxContains([0, 0, 10, 10], [0, 0, 11, 10])).toBe(false);
  });
});

describe('NotesCache', () => {
  const viewport: Bbox = [0, 0, 1, 1];
  const fetchArea = padBbox(viewport);

  it('reuses a containing fetch while it is fresh, including after a small pan', () => {
    const cache = new NotesCache();
    cache.put(fetchArea, [note('a')], 1000);
    expect(cache.get(viewport, 1000)).toEqual([note('a')]);
    expect(cache.get([0.1, 0.1, 1.1, 1.1], 1000)).toEqual([note('a')]);
  });

  it('misses once the entry has expired', () => {
    const cache = new NotesCache();
    cache.put(fetchArea, [note('a')], 0);
    expect(cache.get(viewport, 10 * 60_000)).toBeUndefined();
  });

  it('misses when the viewport is not contained', () => {
    const cache = new NotesCache();
    cache.put(fetchArea, [note('a')], 1000);
    expect(cache.get([50, 50, 51, 51], 1000)).toBeUndefined();
  });

  it('prefers the freshest containing fetch', () => {
    const cache = new NotesCache();
    cache.put(fetchArea, [note('old')], 1000);
    cache.put(fetchArea, [note('new')], 2000);
    expect(cache.get(viewport, 2000)?.[0].id).toBe('new');
  });
});
