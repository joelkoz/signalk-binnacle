import type { TimeBracket, WeatherGrid } from '$entities/weather';
import type { Theme } from '$shared/ui';
import { type FieldBitmap, fieldRgba } from './field-rgba';
import { waveColor } from './wave-colormap';

// The wave-height field bitmap: the shared field builder bound to the grid's wave height and the wave
// colormap for the theme.
export function waveFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): FieldBitmap | undefined {
  return fieldRgba(grid, grid.waveHeight, bracket, (v) => waveColor(v, theme));
}
