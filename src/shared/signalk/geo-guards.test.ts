import { describe, expect, it } from 'vitest';
import { asNumber, isLatLon } from './geo-guards';

describe('geo guards', () => {
  it('isLatLon accepts a lat/lon object', () => {
    expect(isLatLon({ latitude: 1, longitude: 2 })).toBe(true);
  });

  it('isLatLon rejects non-objects and partial shapes', () => {
    expect(isLatLon(null)).toBe(false);
    expect(isLatLon(5)).toBe(false);
    expect(isLatLon({ latitude: 1 })).toBe(false);
  });

  it('asNumber passes numbers through and rejects the rest', () => {
    expect(asNumber(3.5)).toBe(3.5);
    expect(asNumber('3.5')).toBeUndefined();
    expect(asNumber(null)).toBeUndefined();
    expect(asNumber(undefined)).toBeUndefined();
  });
});
