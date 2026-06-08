import type { TideStation } from '$entities/tides';
import { haversineMeters } from '$shared/nav';

export interface RankedStation {
  station: TideStation;
  distanceMeters: number;
}

// The stations within maxDistMeters of the position, nearest first, capped at k.
export function nearestStations(
  stations: TideStation[],
  lat: number,
  lon: number,
  k: number,
  maxDistMeters: number,
): RankedStation[] {
  return stations
    .map((station) => ({
      station,
      distanceMeters: haversineMeters(lat, lon, station.latitude, station.longitude),
    }))
    .filter((ranked) => ranked.distanceMeters <= maxDistMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, k);
}
