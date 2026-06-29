/** Pure estimate helpers for the prewarm panel: project the tile count with the shared enumerator and
 * multiply by the per-source byte average from the cache stats, gated against the free cap. The estimate
 * is a ceiling (a warm negative-caches 404s at zero bytes, so the real footprint is smaller). */

import { CHART_SOURCES, type ChartSource, tileCountInBbox } from 'signalk-binnacle-chart-sources';
import type { CacheStats, WarmStatus } from './prewarm-client.js';

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

/** The single gate predicate shared by the panel and its test. Returns true only when a box is
 * drawn, at least one source is selected, the user can write, and the estimate fits the free cap. */
export function canPrewarm(opts: {
  bbox: [number, number, number, number] | null;
  sources: string[];
  writeBlocked: boolean;
  stats: CacheStats;
  zoomRange: [number, number];
}): boolean {
  if (opts.bbox === null || opts.sources.length === 0 || opts.writeBlocked) return false;
  return !exceedsFreeCap(
    estimateBytes(opts.sources, opts.bbox, opts.zoomRange, opts.stats),
    opts.stats,
  );
}

/** A poll status is terminal when the job is no longer running. A null status means the job is
 * gone (the container restarted and lost the in-memory job); treat it as gone and offer a re-warm. */
export function isTerminal(status: WarmStatus | null): boolean {
  return status === null || status.state !== 'running';
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Humanize a byte count to a rounded value and unit label, for display in the estimate row. */
export function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes >= GB) return { value: (bytes / GB).toFixed(2), unit: 'GB' };
  if (bytes >= MB) return { value: (bytes / MB).toFixed(1), unit: 'MB' };
  if (bytes >= KB) return { value: (bytes / KB).toFixed(1), unit: 'KB' };
  return { value: String(Math.round(bytes)), unit: 'B' };
}
