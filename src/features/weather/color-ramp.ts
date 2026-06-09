import type { Theme } from '$shared/ui';

export type Rgba = [number, number, number, number];

// A value-to-color function for one theme: the day/dusk ramp and the night-red ramp picked by theme.
export type ThemedColor = (value: number, theme: Theme) => Rgba;

// Build a themed colormap from a day/dusk ramp and a night-red ramp. Night-red swaps to the red band,
// every other theme uses the day ramp. Centralizes the night-red swap so each colormap is just its two
// stop tables, not a repeated ternary, keeping the "night-red replaces the ramp" rule in one place.
export function themedRamp(day: Array<[number, Rgba]>, night: Array<[number, Rgba]>): ThemedColor {
  return (value, theme) => sampleRamp(theme === 'night-red' ? night : day, value);
}

// Sample a value against an ascending list of [value, color] stops, linearly interpolating the four
// RGBA channels between the two bracketing stops. NaN and values at or below the first stop return
// the first color; values at or above the last return the last. Shared by the weather colormaps.
export function sampleRamp(stops: Array<[number, Rgba]>, x: number): Rgba {
  if (Number.isNaN(x) || x <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    if (x <= x1) {
      const f = (x - x0) / (x1 - x0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
        c0[3] + (c1[3] - c0[3]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// An Rgba (0..1 channels) as a CSS rgba() string. Shared by the wind color expression and the
// legend swatches.
export function rgbaCss([r, g, b, a]: Rgba): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(2)})`;
}
