import { describe, expect, it } from 'vitest';
import { mapThemePaint } from './map-theme';

describe('mapThemePaint', () => {
  it('returns a background and water color for each theme', () => {
    for (const theme of ['day', 'dusk', 'night-red'] as const) {
      const paint = mapThemePaint(theme);
      expect(typeof paint.background).toBe('string');
      expect(typeof paint.water).toBe('string');
    }
  });

  it('night-red uses a black background', () => {
    expect(mapThemePaint('night-red').background).toBe('#000000');
  });

  it('carries an opaque symbol color for the own vessel and AIS in each theme', () => {
    for (const theme of ['day', 'dusk', 'night-red'] as const) {
      const paint = mapThemePaint(theme);
      expect(paint.ownVessel.a).toBe(0xff);
      expect(paint.aisTarget.a).toBe(0xff);
    }
  });

  it('uses no blue for the night-red own vessel', () => {
    const { ownVessel } = mapThemePaint('night-red');
    expect(ownVessel.r).toBeGreaterThan(ownVessel.b);
    expect(ownVessel.b).toBeLessThan(0x40);
  });
});
