import type { Theme } from '$shared/ui';
import { type Rgba, sampleRamp } from './color-ramp';

// Precipitation stops in mm/h. Day and dusk use a radar-style ramp (light blue, blue, green, yellow,
// orange, red, violet) rising with intensity; blue is acceptable by day. Night-red: a red band on
// black, brightness rising with rate, no blue. Alpha is capped so the field stays an overlay.
const DAY: Array<[number, Rgba]> = [
  [0, [0.4, 0.7, 0.95, 0.0]],
  [0.2, [0.4, 0.7, 0.95, 0.4]],
  [1, [0.2, 0.5, 0.9, 0.5]],
  [2.5, [0.24, 0.75, 0.45, 0.55]],
  [5, [0.9, 0.85, 0.25, 0.6]],
  [10, [0.94, 0.55, 0.22, 0.65]],
  [20, [0.86, 0.26, 0.22, 0.7]],
  [40, [0.6, 0.2, 0.6, 0.75]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.3, 0.04, 0.03, 0.0]],
  [1, [0.45, 0.08, 0.06, 0.4]],
  [10, [0.7, 0.15, 0.1, 0.6]],
  [40, [1.0, 0.3, 0.2, 0.75]],
];

export function precipColor(mmPerHour: number, theme: Theme): Rgba {
  return sampleRamp(theme === 'night-red' ? NIGHT : DAY, mmPerHour);
}
