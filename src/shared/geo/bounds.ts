import type { LatLon } from './geo-guards';

// A geographic bounding box as [west, south, east, north] in degrees, the shape a chart descriptor
// carries.
export type Bbox4 = [number, number, number, number];

// A MapLibre-ready corner pair: [[west, south], [east, north]].
export type CornerBounds = [[number, number], [number, number]];

// Pad applied to a degenerate (zero-width, zero-height, or point) box so a fit does not jump to an
// extreme zoom trying to frame nothing. About 55 m.
const DEGENERATE_PAD_DEG = 0.0005;

// Normalize a bounding box for a map fit, or return null when it is unusable. A box with any
// non-finite coordinate, or with south above north, is rejected (a malformed descriptor: unlike
// west greater than east, latitude has no wraparound to explain the inversion). A west greater
// than east box crosses the antimeridian, expressed by adding 360 to east so the fit takes the
// short way. A zero-area box is padded so it has a real extent.
export function normalizeBounds(bbox: Bbox4): CornerBounds | null {
  const [west, south, east, north] = bbox;
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (south > north) return null;
  const unwrappedEast = east < west ? east + 360 : east;
  const w = unwrappedEast === west ? west - DEGENERATE_PAD_DEG : west;
  const e = unwrappedEast === west ? unwrappedEast + DEGENERATE_PAD_DEG : unwrappedEast;
  const s = north === south ? south - DEGENERATE_PAD_DEG : south;
  const n = north === south ? north + DEGENERATE_PAD_DEG : north;
  return [
    [w, s],
    [e, n],
  ];
}

// Clamp a box to the world and the Web Mercator latitude limit, the bounds a map fit cannot exceed.
// Shared by padBbox and the vessel area-of-interest fallback so the limits live in one place.
export function clampToWorld([west, south, east, north]: Bbox4): Bbox4 {
  return [Math.max(-180, west), Math.max(-85, south), Math.min(180, east), Math.min(85, north)];
}

// Expand a viewport bbox outward by `fraction` on each side, clamped to the world and the Web
// Mercator latitude limit, so one padded fetch covers more than the visible area and a small pan
// reuses it. Shared by the notes and AIS-trails overlays.
export function padBbox([west, south, east, north]: Bbox4, fraction: number): Bbox4 {
  const dx = (east - west) * fraction;
  const dy = (north - south) * fraction;
  return clampToWorld([west - dx, south - dy, east + dx, north + dy]);
}

export function bboxContains(outer: Bbox4, inner: Bbox4): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}

// The four edge getters a MapLibre LngLatBounds exposes, typed structurally so $shared/geo does not
// depend on maplibre-gl and a test can pass a plain object.
export interface LngLatBoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

// A MapLibre LngLatBounds as a [west, south, east, north] box (the visible area as a Bbox4).
// Shared by the chart viewport read and the notes and AIS-trails overlays.
export function lngLatBoundsToBbox4(b: LngLatBoundsLike): Bbox4 {
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

// The bounding box enclosing a set of positions, or undefined when empty, for fitting the chart to a
// route or a track. A single point yields a zero-area box the caller pads before fitting.
export function boundsOfPoints(points: readonly LatLon[]): Bbox4 | undefined {
  if (points.length === 0) return undefined;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const { latitude, longitude } of points) {
    if (longitude < west) west = longitude;
    if (longitude > east) east = longitude;
    if (latitude < south) south = latitude;
    if (latitude > north) north = latitude;
  }
  return [west, south, east, north];
}
