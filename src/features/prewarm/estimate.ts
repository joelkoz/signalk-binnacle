/** Pure estimate helpers for the prewarm panel: project the tile count with the shared enumerator and
 * multiply by the per-source byte average from the cache stats, gated against the free cap. The estimate
 * is a ceiling (a warm negative-caches 404s at zero bytes, so the real footprint is smaller). */

import { CHART_SOURCES, type ChartSource, tileCountInBbox } from 'signalk-binnacle-chart-sources';
import type { CacheStats } from './prewarm-client.js';

/** Fallback per-tile size for a source never cached yet, so the estimate still gates a first prewarm. */
export const DEFAULT_TILE_BYTES = 25_000;

/** The registry sources that have a tile path; the style basemap is excluded (its warm path differs and is out of scope). */
export function prewarmableSources(): ChartSource[] {
  return CHART_SOURCES.filter((s) => s.upstream.mode !== 'style');
}

const byId = new Map(CHART_SOURCES.map((s) => [s.id, s]));

/** The upper-bound byte estimate: sum over sources of tileCountInBbox times the per-source average.
 * Note: sourceIds should come from prewarmableSources() to ensure all ids resolve in the internal source map. */
export function estimateBytes(
  sourceIds: string[],
  bbox: [number, number, number, number],
  zoomRange: [number, number],
  stats: CacheStats,
): number {
  let total = 0;
  for (const id of sourceIds) {
    const source = byId.get(id);
    if (!source) continue;
    const tiles = tileCountInBbox(source, bbox, zoomRange);
    const avg = stats.perSourceAvgBytes[id] ?? DEFAULT_TILE_BYTES;
    total += tiles * avg;
  }
  return total;
}

/** The bytes still available under the cap. */
export function freeCapBytes(stats: CacheStats): number {
  return Math.max(0, stats.cap - stats.bytes);
}

/** Whether the estimate would exceed the free cap (Prewarm is disabled while true). */
export function exceedsFreeCap(estimate: number, stats: CacheStats): boolean {
  return estimate > freeCapBytes(stats);
}

/** The [minLng, minLat, maxLng, maxLat] of a drawn rectangle ring of [lng, lat] points. */
export function bboxFromRectangle(ring: Array<[number, number]>): [number, number, number, number] {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
