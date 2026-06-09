import type { Theme } from '$shared/ui';
import { type Rgba, themedRamp } from './color-ramp';

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
  [0, [0.28, 0.03, 0.02, 0.0]],
  [1.5, [0.45, 0.05, 0.03, 0.45]],
  [4, [0.62, 0.08, 0.04, 0.55]],
  [9, [0.8, 0.11, 0.05, 0.62]],
];

const ARROW: Record<Theme, string> = {
  day: 'rgba(20, 35, 50, 0.85)',
  dusk: 'rgba(210, 220, 235, 0.85)',
  'night-red': 'rgba(200, 50, 35, 0.9)',
};

export const waveColor = themedRamp(DAY, NIGHT);

export function waveArrowColor(theme: Theme): string {
  return ARROW[theme];
}
