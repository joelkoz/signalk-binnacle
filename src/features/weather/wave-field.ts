import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';
import type { Theme } from '$shared/ui';
import { waveColor } from './wave-colormap';

export interface WaveField {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// A wave-height RGBA bitmap at grid resolution, blended across the bracketing forecast steps and
// colored by the wave colormap. Canvas row 0 is the northernmost grid row (the grid stores lats
// south to north, the canvas draws top to bottom). NaN cells (land) are transparent. Returns
// undefined when the grid carries no wave data. MapLibre smooths this with raster-resampling.
export function waveFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): WaveField | undefined {
  const wh = grid.waveHeight;
  if (!wh || wh.length === 0) return undefined;
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = wh[bracket.lo] ?? [];
  const hi = wh[bracket.hi] ?? lo;
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let py = 0; py < rows; py += 1) {
    const gridRow = rows - 1 - py; // flip: canvas top is north
    for (let px = 0; px < cols; px += 1) {
      const i = gridRow * cols + px;
      const [r, g, b, a] = waveColor(lerp(lo[i], hi[i], bracket.frac), theme);
      const o = (py * cols + px) * 4;
      data[o] = r * 255;
      data[o + 1] = g * 255;
      data[o + 2] = b * 255;
      data[o + 3] = a * 255;
    }
  }
  return { data, width: cols, height: rows };
}
