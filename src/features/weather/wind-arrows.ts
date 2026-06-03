import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';

const MIN_SPEED = 0.5; // m/s; skip near-calm cells so the field is not littered with stubs
const ARROW_FRACTION = 0.4; // arrow length as a fraction of the grid spacing

// Build a line per grid cell pointing from the cell toward the wind, tagged with speed (m/s) for
// color. u and v are blended across the two bracketing forecast steps so scrubbing is smooth.
export function windArrowFeatures(
  grid: WeatherGrid,
  bracket: TimeBracket,
): GeoJSON.FeatureCollection {
  const cols = grid.lons.length;
  const dLon = grid.lons.length > 1 ? Math.abs(grid.lons[1] - grid.lons[0]) : 1;
  const dLat = grid.lats.length > 1 ? Math.abs(grid.lats[1] - grid.lats[0]) : 1;
  const len = Math.min(dLon, dLat) * ARROW_FRACTION;
  const features: GeoJSON.Feature[] = [];
  for (let r = 0; r < grid.lats.length; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const u = lerp(grid.windU[bracket.lo][i], grid.windU[bracket.hi][i], bracket.frac);
      const v = lerp(grid.windV[bracket.lo][i], grid.windV[bracket.hi][i], bracket.frac);
      const speed = Math.hypot(u, v);
      if (speed < MIN_SPEED) continue;
      const lon = grid.lons[c];
      const lat = grid.lats[r];
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [lon, lat],
            [lon + (u / speed) * len, lat + (v / speed) * len],
          ],
        },
        properties: { speed },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
