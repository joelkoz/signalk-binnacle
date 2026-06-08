import { describe, expect, it } from 'vitest';
import type { RadarFrame } from '$entities/weather';
import { frameTiles } from './radar-frames';

const frames: RadarFrame[] = [{ time: 1000, path: '/v2/radar/a' }];

describe('frameTiles', () => {
  it('builds a RainViewer tile template', () => {
    const url = frameTiles('https://tilecache.rainviewer.com', frames[0].path);
    expect(url).toBe('https://tilecache.rainviewer.com/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png');
  });
});
