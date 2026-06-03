import type { RadarFrame } from '$entities/weather';

export const TILE_SIZE = 256;
const COLOR_SCHEME = 2; // RainViewer "universal blue" intensity palette
const OPTIONS = '1_1'; // smoothed, with snow

// The MapLibre raster tile template for a RainViewer frame.
export function frameTiles(host: string, frame: RadarFrame): string {
  return `${host}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${OPTIONS}.png`;
}
