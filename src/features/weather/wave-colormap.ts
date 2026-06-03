import type { Theme } from '$shared/ui';
import type { Rgba } from './wind-colormap';

// Wave-height stops in meters. Day and dusk: a translucent calm-to-heavy ramp (teal, green, yellow,
// orange, red, magenta) so the base map reads through. Night-red: a red band on black, brightness
// rising with height, no blue. Alpha is capped so the field stays an overlay, not a fill.
const DAY: Array<[number, Rgba]> = [
  [0, [0.2, 0.6, 0.75, 0.0]],
  [0.5, [0.2, 0.6, 0.75, 0.45]],
  [1.5, [0.24, 0.75, 0.45, 0.5]],
  [2.5, [0.9, 0.85, 0.25, 0.55]],
  [4, [0.94, 0.55, 0.22, 0.6]],
  [6, [0.86, 0.26, 0.22, 0.62]],
  [9, [0.7, 0.2, 0.5, 0.65]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.3, 0.04, 0.03, 0.0]],
  [1.5, [0.5, 0.08, 0.06, 0.45]],
  [4, [0.75, 0.16, 0.11, 0.55]],
  [9, [1.0, 0.3, 0.2, 0.65]],
];

const ARROW: Record<Theme, string> = {
  day: 'rgba(20, 35, 50, 0.85)',
  dusk: 'rgba(210, 220, 235, 0.85)',
  'night-red': 'rgba(200, 50, 35, 0.9)',
};

export function waveColor(heightM: number, theme: Theme): Rgba {
  const stops = theme === 'night-red' ? NIGHT : DAY;
  if (Number.isNaN(heightM) || heightM <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [h0, c0] = stops[i];
    const [h1, c1] = stops[i + 1];
    if (heightM <= h1) {
      const f = (heightM - h0) / (h1 - h0 || 1);
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

export function waveArrowColor(theme: Theme): string {
  return ARROW[theme];
}
