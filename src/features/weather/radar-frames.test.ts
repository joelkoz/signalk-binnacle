import { describe, expect, it } from 'vitest';
import type { RadarFrame } from '$entities/weather';
import { frameTiles, latestFrame } from './radar-frames';

const frames: RadarFrame[] = [
  { time: 1000, path: '/v2/radar/a' },
  { time: 3000, path: '/v2/radar/b' },
  { time: 2000, path: '/v2/radar/c' },
];

describe('latestFrame', () => {
  it('returns the frame with the greatest time', () => {
    expect(latestFrame(frames)?.path).toBe('/v2/radar/b');
  });
  it('returns undefined for no frames', () => {
    expect(latestFrame([])).toBeUndefined();
  });
});

describe('frameTiles', () => {
  it('builds a RainViewer tile template', () => {
    const url = frameTiles('https://tilecache.rainviewer.com', frames[0]);
    expect(url).toBe('https://tilecache.rainviewer.com/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png');
  });
});
