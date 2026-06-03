import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';
import type { Rgba } from './color-ramp';

export interface FieldBitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// Build an RGBA bitmap at grid resolution from a per-step scalar field, blended across the
// bracketing forecast steps and colored by `colorAt`. Canvas row 0 is the northernmost grid row (the
// grid stores lats south to north, the canvas draws top to bottom). NaN cells color via the
// colormap's first stop (transparent). Returns undefined when the field is absent. MapLibre smooths
// the result with raster-resampling.
export function fieldRgba(
  grid: WeatherGrid,
  values: number[][] | undefined,
  bracket: TimeBracket,
  colorAt: (value: number) => Rgba,
): FieldBitmap | undefined {
  if (!values || values.length === 0) return undefined;
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = values[bracket.lo] ?? [];
  const hi = values[bracket.hi] ?? lo;
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let py = 0; py < rows; py += 1) {
    const gridRow = rows - 1 - py;
    for (let px = 0; px < cols; px += 1) {
      const i = gridRow * cols + px;
      const [r, g, b, a] = colorAt(lerp(lo[i], hi[i], bracket.frac));
      const o = (py * cols + px) * 4;
      data[o] = r * 255;
      data[o + 1] = g * 255;
      data[o + 2] = b * 255;
      data[o + 3] = a * 255;
    }
  }
  return { data, width: cols, height: rows };
}
