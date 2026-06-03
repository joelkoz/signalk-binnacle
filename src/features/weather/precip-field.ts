import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';
import type { Theme } from '$shared/ui';
import { precipColor } from './precip-colormap';

export interface PrecipField {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// A precipitation RGBA bitmap at grid resolution, blended across the bracketing forecast steps and
// colored by the precipitation colormap. Canvas row 0 is the northernmost grid row. Returns
// undefined when the grid carries no precipitation. MapLibre smooths this with raster-resampling.
export function precipFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): PrecipField | undefined {
  const pp = grid.precipitation;
  if (!pp || pp.length === 0) return undefined;
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = pp[bracket.lo] ?? [];
  const hi = pp[bracket.hi] ?? lo;
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let py = 0; py < rows; py += 1) {
    const gridRow = rows - 1 - py;
    for (let px = 0; px < cols; px += 1) {
      const i = gridRow * cols + px;
      const [r, g, b, a] = precipColor(lerp(lo[i], hi[i], bracket.frac), theme);
      const o = (py * cols + px) * 4;
      data[o] = r * 255;
      data[o + 1] = g * 255;
      data[o + 2] = b * 255;
      data[o + 3] = a * 255;
    }
  }
  return { data, width: cols, height: rows };
}
