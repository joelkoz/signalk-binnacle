// Linear interpolation between a and b by fraction f (0..1). Shared so the weather overlays blend
// forecast steps and interpolate coordinates through one helper.
export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}
