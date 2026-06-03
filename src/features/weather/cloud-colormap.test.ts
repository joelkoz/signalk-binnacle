import { describe, expect, it } from 'vitest';
import { cloudColor } from './cloud-colormap';

describe('cloudColor', () => {
  it('is transparent under clear sky and opaque under overcast', () => {
    expect(cloudColor(0, 'day')[3]).toBeCloseTo(0, 2);
    expect(cloudColor(1, 'day')[3]).toBeGreaterThan(0.3);
  });
  it('uses no blue at night-red', () => {
    const [r, , b] = cloudColor(1, 'night-red');
    expect(r).toBeGreaterThan(b);
  });
});
