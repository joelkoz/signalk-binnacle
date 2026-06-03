import type { TimeBracket, WeatherGrid } from '$entities/weather';
import type { Theme } from '$shared/ui';
import { cloudColor } from './cloud-colormap';
import { type FieldBitmap, fieldRgba } from './field-rgba';

// The cloud-cover field bitmap: the shared field builder bound to the grid's cloud cover and the
// cloud colormap for the theme.
export function cloudFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): FieldBitmap | undefined {
  return fieldRgba(grid, grid.cloudCover, bracket, (v) => cloudColor(v, theme));
}
