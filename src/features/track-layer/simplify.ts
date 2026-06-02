import type { TrackPoint } from '$entities/track';

// Perpendicular distance from p to the segment a-b, in degree space (planar is fine at the
// scales a display track spans).
function perpendicular(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.lon - a.lon, p.lat - a.lat);
  const t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / len2;
  return Math.hypot(p.lon - (a.lon + t * dx), p.lat - (a.lat + t * dy));
}

function simplifyRun(run: TrackPoint[], tolerance: number): TrackPoint[] {
  if (run.length <= 2) return run;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < run.length - 1; i += 1) {
    const dist = perpendicular(run[i], run[0], run[run.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [run[0], run[run.length - 1]];
  const left = simplifyRun(run.slice(0, index + 1), tolerance);
  const right = simplifyRun(run.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

// Douglas-Peucker simplification that never crosses a break: the points are split into runs
// at every gap point, each run is simplified independently, and the gap point that starts a
// run is always preserved.
export function douglasPeucker(points: readonly TrackPoint[], tolerance: number): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  const runs: TrackPoint[][] = [];
  let current: TrackPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0 && points[i].gap) {
      runs.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  if (current.length > 0) runs.push(current);
  const out: TrackPoint[] = [];
  for (const run of runs) out.push(...simplifyRun(run, tolerance));
  return out;
}
