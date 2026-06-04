import type { TrackPoint } from './track-types';

// A track point as a GeoJSON [lon, lat] coordinate pair (longitude first, per GeoJSON), shared by
// the live, saved, and export coordinate builders so the lon-then-lat order is written once.
export function toLonLat(point: TrackPoint): [number, number] {
  return [point.lon, point.lat];
}

// Split a flat point list into runs at every gap point, so a recording dropout becomes a real
// break instead of a line drawn across it. The gap point that starts a run is preserved as that
// run's first point, and the leading point never starts a new run.
export function splitAtGaps(points: readonly TrackPoint[]): TrackPoint[][] {
  const runs: TrackPoint[][] = [];
  let current: TrackPoint[] = [];
  for (const point of points) {
    if (point.gap && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}
