import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';

const STRIDE = 2; // draw every other cell in each axis so the field is not littered with arrows
const ARROW_FRACTION = 0.5;

// One arrow per strided grid cell pointing the way the waves travel (the reverse of the
// meteorological from-direction), tagged with wave height for coloring. Direction is blended across
// the bracketing steps. Empty when the grid carries no wave direction.
export function waveArrowFeatures(
  grid: WeatherGrid,
  bracket: TimeBracket,
): GeoJSON.FeatureCollection {
  const dirField = grid.waveDirection;
  const hField = grid.waveHeight;
  if (!dirField || !hField) return { type: 'FeatureCollection', features: [] };
  const cols = grid.lons.length;
  const dLon = cols > 1 ? Math.abs(grid.lons[1] - grid.lons[0]) : 1;
  const dLat = grid.lats.length > 1 ? Math.abs(grid.lats[1] - grid.lats[0]) : 1;
  const len = Math.min(dLon, dLat) * ARROW_FRACTION;
  const dLo = dirField[bracket.lo] ?? [];
  const dHi = dirField[bracket.hi] ?? dLo;
  const hLo = hField[bracket.lo] ?? [];
  const hHi = hField[bracket.hi] ?? hLo;
  const features: GeoJSON.Feature[] = [];
  for (let r = 0; r < grid.lats.length; r += STRIDE) {
    for (let c = 0; c < cols; c += STRIDE) {
      const i = r * cols + c;
      const dir = lerp(dLo[i], dHi[i], bracket.frac);
      const height = lerp(hLo[i], hHi[i], bracket.frac);
      if (Number.isNaN(dir) || Number.isNaN(height)) continue;
      // Travel vector: the reverse of the from-direction, the same convention as the wind arrows.
      const u = -Math.sin(dir);
      const v = -Math.cos(dir);
      const lon = grid.lons[c];
      const lat = grid.lats[r];
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [lon, lat],
            [lon + u * len, lat + v * len],
          ],
        },
        properties: { height },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
