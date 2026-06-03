import type { TimeBracket, WeatherGrid } from '$entities/weather';
import type { Theme } from '$shared/ui';
import { type FieldBitmap, fieldRgba } from './field-rgba';
import { precipColor } from './precip-colormap';

// The precipitation field bitmap: the shared field builder bound to the grid's precipitation and the
// precipitation colormap for the theme.
export function precipFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): FieldBitmap | undefined {
  return fieldRgba(grid, grid.precipitation, bracket, (v) => precipColor(v, theme));
}
