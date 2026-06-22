import { describe, expect, it } from 'vitest';
import type { HistoryValues } from '$shared/signalk';
import { SK_PATHS } from '$shared/signalk';
import {
  nearestPositioned,
  nearestSample,
  relativeHours,
  scrubValueText,
  toSamples,
} from './time-travel-timeline';

function values(rows: HistoryValues['rows']): HistoryValues {
  return {
    from: '2026-06-17T00:00:00.000Z',
    to: '2026-06-17T01:00:00.000Z',
    columns: [
      { path: SK_PATHS.position, method: '' },
      { path: SK_PATHS.depthBelowTransducer, method: 'average' },
      { path: SK_PATHS.windSpeedApparent, method: 'max' },
      { path: SK_PATHS.outsidePressure, method: 'average' },
      { path: SK_PATHS.speedOverGround, method: 'average' },
    ],
    rows,
  };
}

describe('toSamples', () => {
  it('maps one row to one sample, resolving columns by path', () => {
    const samples = toSamples(
      values([
        ['2026-06-17T00:00:00.000Z', { latitude: 10, longitude: 20 }, 4.2, 6.1, 101300, 2.5],
      ]),
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      t: Date.parse('2026-06-17T00:00:00.000Z'),
      lat: 10,
      lon: 20,
      depth: 4.2,
      windApparent: 6.1,
      pressure: 101300,
      sog: 2.5,
    });
  });

  it('skips rows with an unparseable timestamp', () => {
    const samples = toSamples(
      values([
        ['not-a-date', { latitude: 1, longitude: 2 }, 1, 1, 1, 1],
        ['2026-06-17T00:01:00.000Z', { latitude: 3, longitude: 4 }, 1, 1, 1, 1],
      ]),
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].lat).toBe(3);
  });

  it('keeps the sample but leaves position undefined for a null position cell', () => {
    const samples = toSamples(values([['2026-06-17T00:00:00.000Z', null, 4.2, null, null, null]]));
    expect(samples[0].lon).toBeUndefined();
    expect(samples[0].lat).toBeUndefined();
    expect(samples[0].depth).toBe(4.2);
    expect(samples[0].windApparent).toBeNull();
  });
});

describe('nearest lookups', () => {
  const samples = [{ t: 0, lon: 1, lat: 1 }, { t: 1000 }, { t: 2000, lon: 2, lat: 2 }];

  it('nearestSample returns the closest by time', () => {
    expect(nearestSample(samples, 900)?.t).toBe(1000);
  });

  it('nearestPositioned skips position-less samples', () => {
    expect(nearestPositioned(samples, 1100)?.t).toBe(2000);
  });
});

describe('label helpers', () => {
  it('relativeHours rounds and floors at zero', () => {
    expect(relativeHours(3_600_000 * 6, 0)).toBe(6);
    expect(relativeHours(0, 3_600_000)).toBe(0);
  });

  it('scrubValueText uses singular and plural hours', () => {
    expect(scrubValueText('14:32', 1)).toBe('14:32, 1 hour ago');
    expect(scrubValueText('14:32', 6)).toBe('14:32, 6 hours ago');
  });
});
