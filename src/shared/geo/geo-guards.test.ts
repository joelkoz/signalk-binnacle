import { describe, expect, it } from 'vitest';
import { asNumber, isLatLon, latLonToLonLat, lonLatToLatLon } from './geo-guards';

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

describe('coordinate conversion', () => {
  it('lonLatToLatLon swaps GeoJSON [lon, lat] to a LatLon object', () => {
    expect(lonLatToLatLon([-166.7, -60.5])).toEqual({ latitude: -60.5, longitude: -166.7 });
  });

  it('latLonToLonLat swaps a LatLon object to GeoJSON [lon, lat]', () => {
    expect(latLonToLonLat({ latitude: -60.5, longitude: -166.7 })).toEqual([-166.7, -60.5]);
  });

  it('round-trips', () => {
    const ll = { latitude: 12.34, longitude: -45.67 };
    expect(lonLatToLatLon(latLonToLonLat(ll))).toEqual(ll);
  });
});
