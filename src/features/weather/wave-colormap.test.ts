import { describe, expect, it } from 'vitest';
import { waveArrowColor, waveColor } from './wave-colormap';

describe('waveColor', () => {
  it('is transparent at calm and opaque at height', () => {
    expect(waveColor(0, 'day')[3]).toBeCloseTo(0, 2);
    expect(waveColor(5, 'day')[3]).toBeGreaterThan(0.4);
  });
  it('uses no blue at night-red', () => {
    const [r, , b] = waveColor(4, 'night-red');
    expect(r).toBeGreaterThan(b);
  });
});

describe('waveArrowColor', () => {
  it('returns a color per theme', () => {
    expect(waveArrowColor('day')).toMatch(/^#|rgb/);
    expect(waveArrowColor('night-red')).toMatch(/rgb/);
  });
});
