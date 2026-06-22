import type { LatLon } from './geo-guards';

// A tenth of a degree (about 11 km): position-keyed caches treat a cell as one spot, so GPS
// drift at anchor or a small pan maps to one key instead of refetching per fix.
export const COORD_CELL_DEG = 0.1;

export function quantizeCellDeg(v: number): string {
  return (Math.round(v / COORD_CELL_DEG) * COORD_CELL_DEG).toFixed(1);
}

// A position rounded to `decimals` places as a "lat,lon" string, about 110 m at the default 3.
// Kept as a string so a position-keyed $derived halts on an unchanged cell: a fresh tuple each GPS
// tick would refetch (and burst provider 400s), but an equal string does not.
export function quantizeLatLonKey(pos: LatLon, decimals = 3): string {
  return `${pos.latitude.toFixed(decimals)},${pos.longitude.toFixed(decimals)}`;
}
