import type { RadarFrame } from '$entities/weather';

const TILE_SIZE = 256;
const COLOR_SCHEME = 2; // RainViewer "universal blue" intensity palette
const OPTIONS = '1_1'; // smoothed, with snow

// The most recent frame (the current radar), or undefined when there are none.
export function latestFrame(frames: RadarFrame[]): RadarFrame | undefined {
  let best: RadarFrame | undefined;
  for (const frame of frames) {
    if (!best || frame.time > best.time) best = frame;
  }
  return best;
}

// The MapLibre raster tile template for a RainViewer frame.
export function frameTiles(host: string, frame: RadarFrame): string {
  return `${host}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${OPTIONS}.png`;
}
