import type { LatLon } from './geo-guards';

// A geographic bounding box as [west, south, east, north] in degrees, the shape a chart descriptor
// carries.
export type Bbox4 = [number, number, number, number];

// A MapLibre-ready corner pair: [[west, south], [east, north]].
type CornerBounds = [[number, number], [number, number]];

// Pad applied to a degenerate (zero-width, zero-height, or point) box so a fit does not jump to an
// extreme zoom trying to frame nothing. About 55 m.
const DEGENERATE_PAD_DEG = 0.0005;

// East below west is the antimeridian-crossing convention; unwrap east past 180 so a span or a fit is
// measured the short way across the seam, not the long way around.
function unwrapEast(west: number, east: number): number {
  return east < west ? east + 360 : east;
}

// Normalize a bounding box for a map fit, or return null when it is unusable. A box with any
// non-finite coordinate, or with south above north, is rejected (a malformed descriptor: unlike
// west greater than east, latitude has no wraparound to explain the inversion). A west greater
// than east box crosses the antimeridian, expressed by adding 360 to east so the fit takes the
// short way. A zero-area box is padded so it has a real extent.
export function normalizeBounds(bbox: Bbox4): CornerBounds | null {
  const [west, south, east, north] = bbox;
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (south > north) return null;
  const unwrappedEast = unwrapEast(west, east);
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
// Shared by padBbox and the vessel area-of-interest fallback so the limits live in one place. Non-
// crossing boxes only: it clamps each longitude into [-180, 180], so an antimeridian-crossing box
// (east < west) would be flattened. padBbox keeps its crossing output within range, so the clamp is a
// no-op there.
export function clampToWorld([west, south, east, north]: Bbox4): Bbox4 {
  return [Math.max(-180, west), Math.max(-85, south), Math.min(180, east), Math.min(85, north)];
}

// Expand a viewport bbox outward by `fraction` on each side, clamped to the world and the Web
// Mercator latitude limit, so one padded fetch covers more than the visible area and a small pan
// reuses it. Shared by the notes and AIS-trails overlays.
export function padBbox([west, south, east, north]: Bbox4, fraction: number): Bbox4 {
  // unwrapEast measures the longitude span the short way across the seam for a crossing box, rather
  // than the negative naive east - west.
  const lonSpan = unwrapEast(west, east) - west;
  const dx = lonSpan * fraction;
  const dy = (north - south) * fraction;
  return clampToWorld([west - dx, south - dy, east + dx, north + dy]);
}

// Whether outer fully encloses inner, for cache-coverage checks. Non-crossing boxes only: the edge
// comparisons are meaningless for a box that wraps the antimeridian (east < west). Its callers pass
// viewport boxes, which MapLibre reports non-crossing.
export function bboxContains(outer: Bbox4, inner: Bbox4): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}

// Whether a non-crossing box contains a point, for an in-view check before a camera move. Same
// non-crossing caveat as bboxContains: the edge comparisons are meaningless for a box that wraps the
// antimeridian. Callers pass a viewport box, which MapLibre reports non-crossing.
export function bboxContainsPoint(box: Bbox4, p: LatLon): boolean {
  return (
    p.longitude >= box[0] && p.longitude <= box[2] && p.latitude >= box[1] && p.latitude <= box[3]
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
// Shared by the chart viewport read and the notes and AIS-trails overlays. MapLibre reports a
// non-crossing viewport, so the box feeds the non-crossing padBbox and bboxContains path.
export function lngLatBoundsToBbox4(b: LngLatBoundsLike): Bbox4 {
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

// The bounding box enclosing a set of positions, or undefined when empty, for fitting the chart to a
// route or a track. A single point yields a zero-area box the caller pads before fitting. A set that
// straddles the antimeridian yields a box in the west > east crossing convention, so the fit takes
// the short way across 180 rather than framing nearly the whole globe.
export function boundsOfPoints(points: readonly LatLon[]): Bbox4 | undefined {
  if (points.length === 0) return undefined;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  // The same longitudes with the western hemisphere shifted to follow the eastern (lon < 0 becomes
  // lon + 360). When this wrapped interval is narrower than the naive one, the points straddle the
  // antimeridian and the box that crosses the seam is the intended fit.
  let shiftedWest = Number.POSITIVE_INFINITY;
  let shiftedEast = Number.NEGATIVE_INFINITY;
  for (const { latitude, longitude } of points) {
    if (longitude < west) west = longitude;
    if (longitude > east) east = longitude;
    if (latitude < south) south = latitude;
    if (latitude > north) north = latitude;
    const shifted = longitude < 0 ? longitude + 360 : longitude;
    if (shifted < shiftedWest) shiftedWest = shifted;
    if (shifted > shiftedEast) shiftedEast = shifted;
  }
  if (shiftedEast - shiftedWest < east - west) {
    // Express the crossing box in the west > east convention padBbox and normalizeBounds handle,
    // wrapping a shifted longitude past 180 back into [-180, 180].
    const wrap = (lon: number): number => (lon > 180 ? lon - 360 : lon);
    return [wrap(shiftedWest), south, wrap(shiftedEast), north];
  }
  return [west, south, east, north];
}
