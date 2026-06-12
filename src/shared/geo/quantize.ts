// A tenth of a degree (about 11 km): position-keyed caches treat a cell as one spot, so GPS
// drift at anchor or a small pan maps to one key instead of refetching per fix.
export const COORD_CELL_DEG = 0.1;

export function quantizeCellDeg(v: number): string {
  return (Math.round(v / COORD_CELL_DEG) * COORD_CELL_DEG).toFixed(1);
}
