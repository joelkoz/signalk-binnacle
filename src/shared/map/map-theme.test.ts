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
});
