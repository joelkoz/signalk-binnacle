import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';
import { cellArrowFeatures } from './arrow-features';

const MIN_SPEED = 0.5; // m/s; skip near-calm cells so the field is not littered with stubs
const ARROW_FRACTION = 0.4; // arrow length as a fraction of the grid spacing

// Build a line per grid cell pointing from the cell toward the wind, tagged with speed (m/s) for
// color. u and v are blended across the two bracketing forecast steps so scrubbing is smooth.
export function windArrowFeatures(
  grid: WeatherGrid,
  bracket: TimeBracket,
): GeoJSON.FeatureCollection {
  const u0 = grid.windU[bracket.lo];
  const u1 = grid.windU[bracket.hi];
  const v0 = grid.windV[bracket.lo];
  const v1 = grid.windV[bracket.hi];
  return cellArrowFeatures(grid, 1, ARROW_FRACTION, (i) => {
    const u = lerp(u0[i], u1[i], bracket.frac);
    const v = lerp(v0[i], v1[i], bracket.frac);
    const speed = Math.hypot(u, v);
    if (speed < MIN_SPEED) return undefined;
    return { u: u / speed, v: v / speed, props: { speed } };
  });
}
