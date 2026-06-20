import type { Bbox4 } from '$shared/geo';
import { withTimeout } from '$shared/lib';
import { asKeyedObject, authInit } from '$shared/signalk';

// One recent-track line for a vessel from the tracks plugin (@signalk/tracks-plugin): the Signal K
// vessel context and a GeoJSON-order [longitude, latitude] line.
export interface AisTrail {
  context: string;
  line: [number, number][];
}

// The track-accumulation API the tracks plugin (plugin id `tracks`) mounts on the v1 REST root.
// The response keys each vessel context to a GeoJSON MultiLineString of its recent track.
const TRACKS_PATH = '/signalk/v1/api/tracks';

// The plugin parses its bbox query positionally into lat-first sw/ne tuples (validateParameters in
// @signalk/tracks), so the working order is south,west,north,east even though its README documents
// longitude first. The wrong order matches nothing, or 404s when south lands above north.
function bboxQuery([west, south, east, north]: Bbox4): string {
  return `${south},${west},${north},${east}`;
}

function asLine(value: unknown): [number, number][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const line: [number, number][] = [];
  for (const position of value) {
    if (!Array.isArray(position)) return undefined;
    // Array.isArray check above makes the cast safe.
    const [lon, lat] = position as unknown[];
    if (typeof lon !== 'number' || typeof lat !== 'number') return undefined;
    line.push([lon, lat]);
  }
  return line;
}

// A trail entry is a GeoJSON MultiLineString ({ type, coordinates }); each member line becomes its
// own trail. A malformed line yields nothing rather than a partial wake, and a line needs at least
// two positions to draw.
function linesFromEntry(raw: unknown): [number, number][][] {
  if (!raw || typeof raw !== 'object') return [];
  const { coordinates } = raw as { coordinates?: unknown };
  if (!Array.isArray(coordinates)) return [];
  const lines: [number, number][][] = [];
  for (const candidate of coordinates) {
    const line = asLine(candidate);
    if (line && line.length >= 2) lines.push(line);
  }
  return lines;
}

// Fetch the recent tracks of every vessel within the viewport. A failed or unreachable fetch
// returns undefined so the overlay keeps the wakes already shown; the plugin also answers 404 when
// installed but not running, and the route is absent without it, so undefined doubles as the
// degrade signal on a stock server.
export async function fetchAisTrails(
  base: string,
  token: string | undefined,
  bbox: Bbox4,
): Promise<AisTrail[] | undefined> {
  try {
    const response = await fetch(
      `${base}${TRACKS_PATH}?bbox=${bboxQuery(bbox)}`,
      withTimeout(authInit(token)),
    );
    if (!response.ok) return undefined;
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    const trails: AisTrail[] = [];
    for (const [context, raw] of Object.entries(keyed)) {
      for (const line of linesFromEntry(raw)) trails.push({ context, line });
    }
    return trails;
  } catch {
    return undefined;
  }
}
