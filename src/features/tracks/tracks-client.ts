import { computeStats, type TrackPoint, toLonLat } from '$entities/track';
import { asKeyedObject, authInit } from '$shared/signalk';
import { toGeoJsonFeature } from './track-export';

// A track read back from the Signal K resources API. Points are grouped one array per segment
// (the breaks between them are gaps). The fetched GeoJSON carries only position, so t and sog
// are absent here; the saved overlay renders saved tracks in a single color, not by speed.
export interface SavedTrack {
  id: string;
  name: string;
  points: TrackPoint[][];
}

// One LineString per segment, for the saved tracks the user has chosen to show. Saved tracks
// draw in a single color, so no per-point speed is carried.
export function savedTracksToFeatures(
  tracks: readonly SavedTrack[],
  shownIds: ReadonlySet<string>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const track of tracks) {
    if (!shownIds.has(track.id)) continue;
    for (const segment of track.points) {
      if (segment.length < 2) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segment.map(toLonLat) },
        properties: { id: track.id },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const V2 = '/signalk/v2/api/resources/tracks';
const V1 = '/signalk/v1/api/resources/tracks';

interface RawGeometry {
  type?: unknown;
  coordinates?: unknown;
}

// A stored track may arrive as a Feature, a Feature nested under `feature`, or a bare geometry;
// pull the line geometry out of whichever shape the provider returned.
function extractGeometry(value: unknown): RawGeometry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { geometry?: unknown; feature?: { geometry?: unknown }; type?: unknown };
  if (v.geometry && typeof v.geometry === 'object') return v.geometry as RawGeometry;
  if (v.feature?.geometry && typeof v.feature.geometry === 'object') {
    return v.feature.geometry as RawGeometry;
  }
  if (v.type === 'MultiLineString' || v.type === 'LineString') return v as RawGeometry;
  return undefined;
}

function isLonLat(coord: unknown): coord is [number, number] {
  return Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number';
}

function lineToPoints(line: unknown): TrackPoint[] {
  if (!Array.isArray(line)) return [];
  const points: TrackPoint[] = [];
  for (const coord of line) {
    if (isLonLat(coord)) points.push({ lat: coord[1], lon: coord[0], t: 0, sog: 0 });
  }
  return points;
}

function geometryToSegments(geom: RawGeometry): TrackPoint[][] {
  // A line needs two positions; drop degenerate single-coordinate segments so a SavedTrack
  // never carries a point that cannot draw and would be silently dropped downstream.
  if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
    return geom.coordinates.map(lineToPoints).filter((segment) => segment.length >= 2);
  }
  if (geom.type === 'LineString') {
    const segment = lineToPoints(geom.coordinates);
    return segment.length >= 2 ? [segment] : [];
  }
  return [];
}

function trackName(value: unknown, id: string): string {
  if (value && typeof value === 'object') {
    const v = value as { name?: unknown; properties?: { name?: unknown } };
    if (typeof v.properties?.name === 'string' && v.properties.name) return v.properties.name;
    if (typeof v.name === 'string' && v.name) return v.name;
  }
  return id;
}

async function tryFetch(url: string, token?: string): Promise<SavedTrack[] | undefined> {
  try {
    const response = await fetch(url, authInit(token));
    if (!response.ok) return undefined;
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    const out: SavedTrack[] = [];
    for (const [id, raw] of Object.entries(keyed)) {
      const geom = extractGeometry(raw);
      if (!geom) continue;
      const segments = geometryToSegments(geom);
      if (segments.length === 0) continue;
      out.push({ id, name: trackName(raw, id), points: segments });
    }
    return out;
  } catch {
    return undefined;
  }
}

export async function fetchSavedTracks(base: string, token?: string): Promise<SavedTrack[]> {
  const v2 = await tryFetch(`${base}${V2}`, token);
  if (v2) return v2;
  const v1 = await tryFetch(`${base}${V1}`, token);
  return v1 ?? [];
}

// Splits the points into a MultiLineString at gaps; distance (meters) and timespan (seconds)
// ride along as SI metadata. Returns whether the write succeeded.
export async function saveTrack(
  base: string,
  token: string | undefined,
  id: string,
  name: string,
  points: readonly TrackPoint[],
): Promise<boolean> {
  const stats = computeStats(points);
  // Reuse the export's Feature (geometry plus the name and source tag); add the SI stats.
  const baseFeature = toGeoJsonFeature(name, points);
  const feature: GeoJSON.Feature = {
    ...baseFeature,
    properties: {
      ...baseFeature.properties,
      distance: stats.distanceMeters,
      timespan: stats.durationSeconds,
    },
  };
  try {
    const response = await fetch(
      `${base}${V2}/${encodeURIComponent(id)}`,
      authInit(token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feature),
      }),
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteTrack(
  base: string,
  token: string | undefined,
  id: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${base}${V2}/${encodeURIComponent(id)}`,
      authInit(token, { method: 'DELETE' }),
    );
    return response.ok;
  } catch {
    return false;
  }
}
