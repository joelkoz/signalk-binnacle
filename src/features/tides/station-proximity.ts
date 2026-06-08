import type { TideStation } from '$entities/tides';
import { DEG_TO_RAD } from '$shared/lib';

const EARTH_RADIUS_M = 6_371_000;

// Great-circle distance in meters between two decimal-degree positions.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

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
