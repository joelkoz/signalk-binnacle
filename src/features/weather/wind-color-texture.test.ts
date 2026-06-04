import { describe, expect, it } from 'vitest';
import { RAMP_MAX_SPEED, RAMP_WIDTH, windColorTexture } from './wind-color-texture';
import { windColor } from './wind-colormap';

describe('windColorTexture', () => {
  it('is a 256x1 RGBA ramp', () => {
    expect(windColorTexture('day')).toHaveLength(RAMP_WIDTH * 4);
  });

  it('matches windColor at the endpoints', () => {
    const ramp = windColorTexture('day');
    const [r, g, b] = windColor(0, 'day');
    expect(ramp[0]).toBe(Math.round(r * 255));
    expect(ramp[1]).toBe(Math.round(g * 255));
    expect(ramp[2]).toBe(Math.round(b * 255));
    const last = (RAMP_WIDTH - 1) * 4;
    const [r2, g2, b2] = windColor(RAMP_MAX_SPEED, 'day');
    expect(ramp[last]).toBe(Math.round(r2 * 255));
    expect(ramp[last + 1]).toBe(Math.round(g2 * 255));
    expect(ramp[last + 2]).toBe(Math.round(b2 * 255));
  });

  it('keeps night-red free of blue', () => {
    const ramp = windColorTexture('night-red');
    for (let i = 0; i < RAMP_WIDTH; i += 1) {
      expect(ramp[i * 4 + 2]).toBeLessThanOrEqual(20);
    }
  });
});
