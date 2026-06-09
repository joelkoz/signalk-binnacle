import { MINUTE_MS } from '$shared/lib';
import type { Bbox, NotePoint } from './notes-client';

// A fetched note set stays usable for this long before a re-fetch. POIs (marinas, anchorages, and
// hazards) are effectively static within a session, so a few minutes keeps them fresh while cutting
// the request volume that made panning slow.
const TTL_MS = 5 * MINUTE_MS;
// Keep only the most recent fetches so a long session of panning cannot grow the cache without bound.
const MAX_ENTRIES = 12;
// Fetch this fraction of the viewport beyond every edge, so a small pan or a zoom-in stays inside a
// recent fetch and reuses it instead of hitting the network.
const PAD_FRACTION = 0.5;

interface CacheEntry {
  bbox: Bbox;
  notes: NotePoint[];
  expires: number;
}

// Expand a viewport bbox outward by `fraction` on each side, clamped to the world and the Web
// Mercator latitude limit, so one fetch covers more than the visible area.
export function padBbox([west, south, east, north]: Bbox, fraction = PAD_FRACTION): Bbox {
  const dx = (east - west) * fraction;
  const dy = (north - south) * fraction;
  return [
    Math.max(-180, west - dx),
    Math.max(-85, south - dy),
    Math.min(180, east + dx),
    Math.min(85, north + dy),
  ];
}

// Whether `outer` fully contains `inner` (longitude-first). A view crossing the antimeridian has
// west > east; it fails containment here and falls through to a fetch, which is correct if
// conservative, and such views are rare on a chart.
export function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}

// A small, bounded, time-limited cache of fetched note sets keyed by the padded area each fetch
// covered. A viewport that still sits inside a recent fetch reuses it, so panning back, panning a
// little, or zooming in never re-hits the network.
export class NotesCache {
  #entries: CacheEntry[] = [];

  // The notes from the freshest non-expired fetch whose area still contains the viewport, or
  // undefined when nothing covers it and a fetch is needed.
  get(viewport: Bbox, nowMs: number): NotePoint[] | undefined {
    for (let i = this.#entries.length - 1; i >= 0; i--) {
      const entry = this.#entries[i];
      if (entry.expires > nowMs && bboxContains(entry.bbox, viewport)) return entry.notes;
    }
    return undefined;
  }

  // Record a fetch's area and its notes, dropping expired entries and keeping only the newest
  // MAX_ENTRIES so the cache stays bounded.
  put(bbox: Bbox, notes: NotePoint[], nowMs: number): void {
    this.#entries.push({ bbox, notes, expires: nowMs + TTL_MS });
    this.#entries = this.#entries.filter((entry) => entry.expires > nowMs).slice(-MAX_ENTRIES);
  }
}
