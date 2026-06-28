import { describe, expect, it } from 'vitest';
import {
  bboxFromRectangle,
  DEFAULT_TILE_BYTES,
  estimateBytes,
  exceedsFreeCap,
  freeCapBytes,
  prewarmableSources,
} from './estimate.js';
import type { CacheStats } from './prewarm-client.js';

const stats = (over: Partial<CacheStats> = {}): CacheStats => ({
  rows: 0,
  bytes: 0,
  cap: 1_000_000_000,
  perSourceAvgBytes: {},
  ...over,
});

describe('prewarm estimate', () => {
  it('excludes style sources from the prewarmable list', () => {
    expect(prewarmableSources().some((s) => s.upstream.mode === 'style')).toBe(false);
    expect(prewarmableSources().some((s) => s.id === 'seamark')).toBe(true);
  });

  it('uses the per-source average when present, the default otherwise', () => {
    const bbox: [number, number, number, number] = [-1, -1, 1, 1];
    const withAvg = estimateBytes(
      ['seamark'],
      bbox,
      [6, 6],
      stats({ perSourceAvgBytes: { seamark: 100 } }),
    );
    const withDefault = estimateBytes(['seamark'], bbox, [6, 6], stats());
    expect(withAvg).toBeGreaterThan(0);
    expect(withDefault).toBeGreaterThan(0);
    expect(withDefault % DEFAULT_TILE_BYTES).toBe(0);
  });

  it('the free cap is the cap minus the used bytes', () => {
    expect(freeCapBytes(stats({ cap: 1000, bytes: 400 }))).toBe(600);
  });

  it('flags an estimate over the free cap', () => {
    expect(exceedsFreeCap(700, stats({ cap: 1000, bytes: 400 }))).toBe(true);
    expect(exceedsFreeCap(500, stats({ cap: 1000, bytes: 400 }))).toBe(false);
  });

  it('derives a bbox from a drawn rectangle ring', () => {
    const ring: Array<[number, number]> = [
      [10, 50],
      [20, 50],
      [20, 55],
      [10, 55],
      [10, 50],
    ];
    expect(bboxFromRectangle(ring)).toEqual([10, 50, 20, 55]);
  });
});
