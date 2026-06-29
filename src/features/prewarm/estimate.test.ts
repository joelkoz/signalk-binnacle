import { describe, expect, it } from 'vitest';
import {
  bboxFromRectangle,
  coveringSources,
  DEFAULT_TILE_BYTES,
  estimateBytes,
  exceedsRegionsFree,
  formatBySource,
  regionSources,
  regionsFreeBytes,
} from './estimate.js';
import type { CacheStats } from './regions-client.js';

const stats = (over: Partial<CacheStats> = {}): CacheStats => ({
  rows: 0,
  bytes: 0,
  cap: 1_000_000_000,
  pinnedBytes: 0,
  scrollBytes: 0,
  regionsBudgetBytes: 500_000_000,
  positionWarmBudgetBytes: 50_000_000,
  positionWarmBytes: 0,
  regionsFreeBytes: 450_000_000,
  perSourceAvgBytes: {},
  ...over,
});

describe('regions estimate', () => {
  it('excludes style sources from the region list', () => {
    expect(regionSources().some((s) => s.upstream.mode === 'style')).toBe(false);
    expect(regionSources().some((s) => s.id === 'seamark')).toBe(true);
  });

  it('uses the per-source average when present, the default otherwise', () => {
    const bbox: [number, number, number, number] = [-1, -1, 1, 1];
    const withAvg = estimateBytes(
      ['seamark'],
      bbox,
      [6, 6],
      stats({ perSourceAvgBytes: { seamark: 100 } }).perSourceAvgBytes,
    );
    const withDefault = estimateBytes(['seamark'], bbox, [6, 6], stats().perSourceAvgBytes);
    expect(withAvg).toBeGreaterThan(0);
    expect(withDefault).toBeGreaterThan(0);
    expect(withDefault % DEFAULT_TILE_BYTES).toBe(0);
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

describe('coveringSources', () => {
  it('includes a global source (no bounds) for any non-empty bbox', () => {
    const bbox: [number, number, number, number] = [-122.5, 37.5, -122.0, 38.0];
    const result = coveringSources(bbox, [6, 12]);
    // depth-gebco has no bounds and maxzoom 12; it covers any valid bbox.
    expect(result.some((s) => s.id === 'depth-gebco')).toBe(true);
  });

  it('excludes the style basemap', () => {
    const bbox: [number, number, number, number] = [-122.5, 37.5, -122.0, 38.0];
    expect(coveringSources(bbox, [6, 12]).every((s) => s.upstream.mode !== 'style')).toBe(true);
  });

  it('excludes a bounded source with no overlap with the bbox', () => {
    // depth-emodnet bounds are [-73.125, 5.625, 45.0, 90.0]; a Pacific bbox has no overlap.
    const pacific: [number, number, number, number] = [-150.0, 20.0, -120.0, 50.0];
    expect(coveringSources(pacific, [6, 12]).some((s) => s.id === 'depth-emodnet')).toBe(false);
  });
});

describe('regionsFreeBytes', () => {
  it('returns the server-computed regionsFreeBytes from stats', () => {
    expect(regionsFreeBytes(stats({ regionsFreeBytes: 400_000_000 }))).toBe(400_000_000);
  });
  it('is floored at 0', () => {
    expect(
      regionsFreeBytes(
        stats({ regionsFreeBytes: undefined, regionsBudgetBytes: 100, pinnedBytes: 200 }),
      ),
    ).toBe(0);
  });
});

describe('exceedsRegionsFree', () => {
  it('returns true when the estimate exceeds regionsFreeBytes', () => {
    expect(exceedsRegionsFree(600_000_000, stats({ regionsFreeBytes: 500_000_000 }))).toBe(true);
  });
  it('returns false when the estimate fits', () => {
    expect(exceedsRegionsFree(100_000, stats({ regionsFreeBytes: 500_000_000 }))).toBe(false);
  });
});

describe('formatBySource', () => {
  it('formats each scroll source and returns an empty list when bySource is absent', () => {
    const base = { rows: 0, bytes: 0, cap: 0, perSourceAvgBytes: {} } as CacheStats;
    expect(formatBySource(base)).toEqual([]);
    const withSources = {
      ...base,
      bySource: [{ source: 'seamark', bytes: 1024, rows: 3 }],
    } as CacheStats;
    const out = formatBySource(withSources);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('seamark');
    expect(typeof out[0].value).toBe('string');
    expect(typeof out[0].unit).toBe('string');
  });
});
