import { describe, expect, it } from 'vitest';
import { precipColor } from './precip-colormap';

describe('precipColor', () => {
  it('is transparent when dry and opaque when raining', () => {
    expect(precipColor(0, 'day')[3]).toBeCloseTo(0, 2);
    expect(precipColor(10, 'day')[3]).toBeGreaterThan(0.4);
  });
  it('uses no blue at night-red', () => {
    const [r, , b] = precipColor(10, 'night-red');
    expect(r).toBeGreaterThan(b);
  });
});
