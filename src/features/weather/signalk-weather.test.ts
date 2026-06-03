import { describe, expect, it, vi } from 'vitest';
import {
  conditionsFromSignalK,
  defaultProviderName,
  fetchObservations,
  fetchPointForecasts,
  fetchWeatherProviders,
  fetchWeatherWarnings,
  nearestInTime,
  readoutFromSignalK,
  type SignalKWeatherData,
} from './signalk-weather';

const ORIGIN = 'https://boat.local';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function mockFetch(body: unknown, ok = true) {
  return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, ok));
}

describe('fetchWeatherProviders', () => {
  it('returns the providers object', async () => {
    const fetchFn = mockFetch({ 'open-meteo': { name: 'OpenMeteo', isDefault: true } });
    const providers = await fetchWeatherProviders(ORIGIN, undefined, fetchFn);
    expect(providers).toEqual({ 'open-meteo': { name: 'OpenMeteo', isDefault: true } });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://boat.local/signalk/v2/api/weather/_providers',
      undefined,
    );
  });

  it('returns {} when none configured', async () => {
    expect(await fetchWeatherProviders(ORIGIN, undefined, mockFetch({}))).toEqual({});
  });

  it('returns undefined on a non-ok response', async () => {
    expect(await fetchWeatherProviders(ORIGIN, undefined, mockFetch({}, false))).toBeUndefined();
  });

  it('returns undefined on a thrown transport error', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    expect(await fetchWeatherProviders(ORIGIN, undefined, fetchFn)).toBeUndefined();
  });
});

describe('defaultProviderName', () => {
  it('picks the default provider name', () => {
    expect(
      defaultProviderName({
        a: { name: 'AccuWeather', isDefault: true },
        b: { name: 'OpenMeteo', isDefault: false },
      }),
    ).toBe('AccuWeather');
  });

  it('falls back to the first when none is flagged default', () => {
    expect(defaultProviderName({ b: { name: 'OpenMeteo', isDefault: false } })).toBe('OpenMeteo');
  });

  it('accepts a legacy provider field', () => {
    expect(defaultProviderName({ a: { provider: 'AccuWeather', isDefault: true } })).toBe(
      'AccuWeather',
    );
  });

  it('falls back to the provider id when no name is present', () => {
    expect(defaultProviderName({ 'open-meteo': { isDefault: true } })).toBe('open-meteo');
  });

  it('is undefined when there are no providers', () => {
    expect(defaultProviderName({})).toBeUndefined();
    expect(defaultProviderName(undefined)).toBeUndefined();
  });
});

describe('fetchWeatherWarnings', () => {
  it('returns the warnings array', async () => {
    const warnings = [{ startTime: 'a', endTime: 'b', details: 'Gale', source: 's', type: 'gale' }];
    const fetchFn = mockFetch(warnings);
    expect(await fetchWeatherWarnings(ORIGIN, 1, 2, undefined, fetchFn)).toEqual(warnings);
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://boat.local/signalk/v2/api/weather/warnings?lat=1&lon=2',
    );
  });

  it('returns undefined when the body is not an array', async () => {
    expect(await fetchWeatherWarnings(ORIGIN, 0, 0, undefined, mockFetch({}))).toBeUndefined();
  });

  it('returns undefined on a non-ok response', async () => {
    expect(
      await fetchWeatherWarnings(ORIGIN, 0, 0, undefined, mockFetch([], false)),
    ).toBeUndefined();
  });

  it('returns undefined on a thrown transport error', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    expect(await fetchWeatherWarnings(ORIGIN, 0, 0, undefined, fetchFn)).toBeUndefined();
  });
});

describe('fetchObservations', () => {
  it('builds the point query and returns the first record', async () => {
    const obs: SignalKWeatherData = { date: '2026-06-03T12:00:00Z', wind: { speedTrue: 5 } };
    const fetchFn = mockFetch(obs);
    const result = await fetchObservations(ORIGIN, 5.5, -7.25, 'tok', fetchFn);
    expect(result).toEqual(obs);
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://boat.local/signalk/v2/api/weather/observations?lat=5.5&lon=-7.25',
    );
  });

  it('returns undefined when the body is not weather data', async () => {
    expect(await fetchObservations(ORIGIN, 0, 0, undefined, mockFetch(null))).toBeUndefined();
  });
});

describe('fetchPointForecasts', () => {
  it('includes the count and returns the series', async () => {
    const series: SignalKWeatherData[] = [
      { date: '2026-06-03T12:00:00Z' },
      { date: '2026-06-03T15:00:00Z' },
    ];
    const fetchFn = mockFetch(series);
    const result = await fetchPointForecasts(ORIGIN, 1, 2, 12, undefined, fetchFn);
    expect(result).toEqual(series);
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://boat.local/signalk/v2/api/weather/forecasts/point?lat=1&lon=2&count=12',
    );
  });
});

describe('readoutFromSignalK', () => {
  it('maps a point reading to a WeatherReadout', () => {
    const data: SignalKWeatherData = {
      date: 'now',
      wind: { speedTrue: 10, directionTrue: 1.2 },
      outside: { pressure: 101300, cloudCover: 0.5, precipitationVolume: 2 },
      water: { waveSignificantHeight: 1.5, wavePeriod: 7 },
    };
    expect(readoutFromSignalK(data)).toEqual({
      speedMs: 10,
      fromRad: 1.2,
      pressurePa: 101300,
      waveHeightM: 1.5,
      wavePeriodS: 7,
      precipitationMm: 2,
      cloudCoverFraction: 0.5,
    });
  });

  it('returns undefined when wind is missing, so the caller falls back to the grid', () => {
    expect(readoutFromSignalK({ date: 'now', outside: { pressure: 101000 } })).toBeUndefined();
  });
});

describe('conditionsFromSignalK', () => {
  it('maps a point reading to PointConditions, carrying temperature and gust', () => {
    const data: SignalKWeatherData = {
      date: '2026-06-03T12:00:00Z',
      wind: { speedTrue: 8, directionTrue: 2, gust: 12 },
      outside: { temperature: 290, pressure: 101000, cloudCover: 0.25, precipitationVolume: 0.5 },
      water: { waveSignificantHeight: 1, wavePeriod: 6 },
    };
    expect(conditionsFromSignalK(data)).toEqual({
      timeMs: Date.parse('2026-06-03T12:00:00Z'),
      windMs: 8,
      fromRad: 2,
      gustMs: 12,
      pressurePa: 101000,
      airTempK: 290,
      cloudFraction: 0.25,
      waveHeightM: 1,
      wavePeriodS: 6,
      precipitationMm: 0.5,
    });
  });
});

describe('nearestInTime', () => {
  const series: SignalKWeatherData[] = [
    { date: '2026-06-03T12:00:00Z' },
    { date: '2026-06-03T15:00:00Z' },
    { date: '2026-06-03T18:00:00Z' },
  ];

  it('finds the entry closest to the target time', () => {
    const target = Date.parse('2026-06-03T15:40:00Z');
    expect(nearestInTime(series, target)?.date).toBe('2026-06-03T15:00:00Z');
  });

  it('skips entries with an unparseable date', () => {
    const mixed: SignalKWeatherData[] = [{ date: 'not-a-date' }, { date: '2026-06-03T15:00:00Z' }];
    expect(nearestInTime(mixed, Date.parse('2026-06-03T15:10:00Z'))?.date).toBe(
      '2026-06-03T15:00:00Z',
    );
    expect(nearestInTime([{ date: 'nope' }], 0)).toBeUndefined();
  });

  it('is undefined for an empty series', () => {
    expect(nearestInTime([], 0)).toBeUndefined();
  });
});
