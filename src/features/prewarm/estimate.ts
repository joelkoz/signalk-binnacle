/** Pure estimate helpers for the regions panel: project the tile count with the shared enumerator and
 * multiply by the per-source byte average from the cache stats, gated against the regions-free budget.
 * The estimate is a ceiling (a warm negative-caches 404s at zero bytes, so the real footprint is
 * smaller). DEFAULT_TILE_BYTES and estimateBytes are hoisted into the shared package so the panel and
 * the companion plugin share one implementation and the server-side budget re-validation agrees. */

import {
  type ChartSource,
  CHART_SOURCES,
  DEFAULT_TILE_BYTES,
  estimateBytes,
  tileCountInBbox,
} from 'signalk-binnacle-chart-sources';
import type { CacheStats, WarmStatus } from './regions-client.js';

/** Re-exported from the shared package so the panel, the plugin, and any caller share one estimate. */
export { DEFAULT_TILE_BYTES, estimateBytes };

/** The registry sources that have a tile path; the style basemap is excluded (its warm path differs and is out of scope). */
export function regionSources(): ChartSource[] {
  return CHART_SOURCES.filter((s) => s.upstream.mode !== 'style');
}

/** Sources that cover the drawn bbox: region sources where tileCountInBbox > 0. Sources with no
 * bounds are global and always included for a non-empty bbox; the style basemap is already excluded. */
export function coveringSources(
  bbox: [number, number, number, number],
  zoomRange: [number, number],
): ChartSource[] {
  return regionSources().filter((s) => tileCountInBbox(s, bbox, zoomRange) > 0);
}

/** Room for new real-region pins. Prefers the server-computed regionsFreeBytes (which already accounts
 * for the position-warm reserve P), falling back to a local floor at 0 that mirrors the container's
 * (R - P) - real_pinned. */
export function regionsFreeBytes(stats: CacheStats): number {
  return Math.max(
    0,
    stats.regionsFreeBytes ??
      Math.max(
        0,
        (stats.regionsBudgetBytes ?? 0) -
          (stats.positionWarmBudgetBytes ?? 0) -
          Math.max(0, (stats.pinnedBytes ?? 0) - (stats.positionWarmBytes ?? 0)),
      ),
  );
}

/** True when the estimate exceeds regionsFreeBytes (Download is disabled while true). */
export function exceedsRegionsFree(estimate: number, stats: CacheStats): boolean {
  return estimate > regionsFreeBytes(stats);
}

/** The [minLng, minLat, maxLng, maxLat] of a drawn rectangle ring of [lng, lat] points. */
export function bboxFromRectangle(ring: Array<[number, number]>): [number, number, number, number] {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** The single gate predicate shared by the panel and its test. Returns true only when a box is
 * drawn, at least one source is selected, the user can write, and the estimate fits the regions-free
 * budget. */
export function canDownloadRegion(opts: {
  bbox: [number, number, number, number] | null;
  sources: string[];
  writeBlocked: boolean;
  stats: CacheStats;
  zoomRange: [number, number];
}): boolean {
  if (opts.bbox === null || opts.sources.length === 0 || opts.writeBlocked) return false;
  return !exceedsRegionsFree(
    estimateBytes(opts.sources, opts.bbox, opts.zoomRange, opts.stats.perSourceAvgBytes),
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
