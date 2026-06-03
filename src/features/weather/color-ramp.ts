export type Rgba = [number, number, number, number];

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
