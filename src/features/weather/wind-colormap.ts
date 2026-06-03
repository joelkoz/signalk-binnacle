import type { Theme } from '$shared/ui';

export type Rgba = [number, number, number, number];

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

function rgbaString([r, g, b, a]: Rgba): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(2)})`;
}

// A MapLibre interpolate expression that colors a feature by its numeric `speed` property (m/s) for
// the theme. Returned as a plain nested array so this module stays free of MapLibre types; the
// overlay casts it to ExpressionSpecification.
export function windColorExpression(theme: Theme): unknown[] {
  const stops = EXPR_SPEEDS.flatMap((s) => [s, rgbaString(windColor(s, theme))]);
  return ['interpolate', ['linear'], ['get', 'speed'], ...stops];
}

export function windColor(speedMs: number, theme: Theme): Rgba {
  const stops = theme === 'night-red' ? NIGHT : DAY;
  if (speedMs <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [s0, c0] = stops[i];
    const [s1, c1] = stops[i + 1];
    if (speedMs <= s1) {
      const f = (speedMs - s0) / (s1 - s0 || 1);
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
