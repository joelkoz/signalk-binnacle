// One recorded fix on the own-vessel track. Position is decimal degrees (the SI exception),
// sog is m/s (SI), t is epoch milliseconds. gap is true when a break precedes this point, so
// the renderer does not draw a segment from the previous point across a dropout.
export interface TrackPoint {
  lat: number;
  lon: number;
  t: number;
  sog: number;
  gap?: boolean;
}

export interface TrackStats {
  distanceMeters: number;
  durationSeconds: number;
  avgSog: number;
  maxSog: number;
}
