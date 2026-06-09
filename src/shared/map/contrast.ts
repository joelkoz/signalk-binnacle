import type { Rgba } from './icon-raster';

// A fixed dark scrim placed under a bright marker (the route line, the note selection ring, and the AIS
// triangle) so it reads on light day water and stays invisible on the dark dusk and night-red maps,
// where the bright shape carries on its own. Theme-independent on purpose, so it lives here as one
// constant rather than a per-theme paint token, and each marker applies it in the form it needs.
export const DARK_SCRIM: Rgba = { r: 0, g: 0, b: 0, a: 128 };

// A CSS rgba() string for an Rgba color, for the MapLibre paint properties that take a color string.
export function rgbaCss(c: Rgba): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255).toFixed(3)})`;
}
