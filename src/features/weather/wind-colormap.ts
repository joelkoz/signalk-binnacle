import type { Theme } from '$shared/ui';
import { type Rgba, rgbaCss, sampleRamp } from './color-ramp';

// Speed stops in m/s. Day and dusk use a marine wind ramp: teal, green, yellow, orange, red.
const DAY: Array<[number, Rgba]> = [
  [0, [0.16, 0.66, 0.79, 0.0]],
  [3, [0.16, 0.66, 0.79, 0.9]],
  [7, [0.22, 0.77, 0.41, 0.9]],
  [12, [0.9, 0.85, 0.23, 0.9]],
  [18, [0.94, 0.54, 0.23, 0.95]],
  [26, [0.88, 0.28, 0.23, 1.0]],
];
// Night-red: a pure red band on black, brightness rising with speed, no blue.
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.35, 0.05, 0.04, 0.0]],
  [7, [0.6, 0.1, 0.08, 0.85]],
  [18, [0.8, 0.18, 0.12, 0.95]],
  [26, [1.0, 0.3, 0.2, 1.0]],
];

const EXPR_SPEEDS = [0, 3, 7, 12, 18, 26];

// A MapLibre interpolate expression that colors a feature by its numeric `speed` property (m/s) for
// the theme. Returned as a plain nested array so this module stays free of MapLibre types; the
// overlay casts it to ExpressionSpecification.
export function windColorExpression(theme: Theme): unknown[] {
  const stops = EXPR_SPEEDS.flatMap((s) => [s, rgbaCss(windColor(s, theme))]);
  return ['interpolate', ['linear'], ['get', 'speed'], ...stops];
}

export function windColor(speedMs: number, theme: Theme): Rgba {
  return sampleRamp(theme === 'night-red' ? NIGHT : DAY, speedMs);
}
