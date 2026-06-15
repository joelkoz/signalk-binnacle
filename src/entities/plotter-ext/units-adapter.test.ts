import { describe, expect, it } from 'vitest';
import { unitsForMode } from './units-adapter';

describe('unitsForMode', () => {
  it('keeps marine speed and distance and varies the rest by mode', () => {
    expect(unitsForMode('metric')).toEqual({
      speed: 'kn',
      distance: 'naut-mile',
      depth: 'm',
      length: 'm',
      temperature: 'C',
    });
    expect(unitsForMode('imperial')).toEqual({
      speed: 'kn',
      distance: 'naut-mile',
      depth: 'foot',
      length: 'foot',
      temperature: 'F',
    });
  });
});
