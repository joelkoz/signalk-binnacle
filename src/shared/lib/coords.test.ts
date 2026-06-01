import { describe, expect, it } from 'vitest';
import { formatLatitude, formatLongitude } from './coords';

describe('formatLatitude', () => {
  it('formats a northern latitude with a hemisphere suffix', () => {
    expect(formatLatitude(45.5)).toBe('45.5000° N');
  });

  it('formats a southern latitude as positive degrees with S', () => {
    expect(formatLatitude(-33.8688)).toBe('33.8688° S');
  });

  it('treats the equator as N', () => {
    expect(formatLatitude(0)).toBe('0.0000° N');
  });

  it('returns a placeholder for an absent value', () => {
    expect(formatLatitude(undefined)).toBe('--');
  });
});

describe('formatLongitude', () => {
  it('formats an eastern longitude with E', () => {
    expect(formatLongitude(151.2093)).toBe('151.2093° E');
  });

  it('formats a western longitude as positive degrees with W', () => {
    expect(formatLongitude(-122.4194)).toBe('122.4194° W');
  });

  it('returns a placeholder for an absent value', () => {
    expect(formatLongitude(null)).toBe('--');
  });
});
