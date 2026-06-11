// Linear interpolation between a and b by fraction f (0..1). Shared so the weather overlays blend
// forecast steps and interpolate coordinates through one helper.
export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

// A finite-number type guard, shared so the persisted-state and descriptor validators do not each
// re-declare it.
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// The item whose time is nearest the target, skipping items with a NaN time. One scan shared by
// the nearest-forecast-step, nearest-grid-time, and latest-observation lookups, which were three
// structurally identical loops.
export function nearestBy<T>(
  items: readonly T[],
  toMs: (item: T) => number,
  targetMs: number,
): T | undefined {
  let best: T | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const t = toMs(item);
    if (Number.isNaN(t)) continue;
    const gap = Math.abs(t - targetMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = item;
    }
  }
  return best;
}
