// A geographic bounding box as [west, south, east, north] in degrees, the shape a chart descriptor
// carries.
export type Bbox4 = [number, number, number, number];

// A MapLibre-ready corner pair: [[west, south], [east, north]].
export type CornerBounds = [[number, number], [number, number]];

// Pad applied to a degenerate (zero-width, zero-height, or point) box so a fit does not jump to an
// extreme zoom trying to frame nothing. About 55 m.
const DEGENERATE_PAD_DEG = 0.0005;

// Normalize a bounding box for a map fit, or return null when it is unusable. A box with any
// non-finite coordinate is rejected (a malformed descriptor). A west greater than east box crosses
// the antimeridian, expressed by adding 360 to east so the fit takes the short way. A zero-area box
// is padded so it has a real extent.
export function normalizeBounds(bbox: Bbox4): CornerBounds | null {
  const [west, south, east, north] = bbox;
  if (![west, south, east, north].every(Number.isFinite)) return null;
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
