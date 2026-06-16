import { describe, expect, it } from 'vitest';
import { asNumber, isLatLon, latLonToLonLat, lonLatToLatLon, roundLatLon } from './geo-guards';

// Terra Draw counts a coordinate's decimal places exactly this way and rejects a feature whose count
// exceeds its store precision, so the rounding is verified against the same measure.
function decimals(n: number): number {
  let scale = 1;
  let count = 0;
  while (Math.round(n * scale) / scale !== n) {
    scale *= 10;
    count += 1;
    if (count > 30) break;
  }
  return count;
}

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

describe('roundLatLon', () => {
  // 1/3 and 1/7 have no finite decimal expansion, so the position carries a full double's worth of
  // digits (14 to 15 decimals) without a precision-losing literal, which the linter rejects.
  const raw = { latitude: 42 + 1 / 3, longitude: -83 - 1 / 7 };

  it('clamps a full-precision position to the requested decimal count', () => {
    expect(decimals(raw.latitude)).toBeGreaterThan(9);
    const rounded = roundLatLon(raw, 9);
    expect(decimals(rounded.latitude)).toBeLessThanOrEqual(9);
    expect(decimals(rounded.longitude)).toBeLessThanOrEqual(9);
  });

  it('shifts a point by less than the editor name-match epsilon when rounding to 9', () => {
    const rounded = roundLatLon(raw, 9);
    expect(Math.abs(rounded.latitude - raw.latitude)).toBeLessThan(1e-9);
    expect(Math.abs(rounded.longitude - raw.longitude)).toBeLessThan(1e-9);
  });

  it('leaves an already-coarse position unchanged', () => {
    const ll = { latitude: 12.34, longitude: -45.67 };
    expect(roundLatLon(ll, 9)).toEqual(ll);
  });
});
