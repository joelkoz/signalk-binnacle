import { describe, expect, it, vi } from 'vitest';
import { createExpiringStore } from '$shared/storage';
import {
  createPointConditionsLoader,
  type ProviderPoint,
  pointConditionsKey,
} from './point-conditions';
import type { SignalKWeatherData, WeatherWarning } from './signalk-weather';

const OBS: SignalKWeatherData = {
  date: '2026-06-11T12:00:00Z',
  wind: { speedTrue: 5, directionTrue: 1 },
};
const SERIES: SignalKWeatherData[] = [
  { date: '2026-06-11T15:00:00Z', wind: { speedTrue: 7, directionTrue: 1.2 } },
];
const WARNING: WeatherWarning = {
  startTime: '2026-06-11T00:00:00Z',
  endTime: '2026-06-12T00:00:00Z',
  details: 'Gale warning in effect',
  source: 'NWS',
  type: 'Gale',
};

function makeDeps(nowRef: { ms: number }) {
  return {
    observations: vi.fn(async () => OBS),
    forecasts: vi.fn(async () => SERIES),
    warnings: vi.fn(async () => [WARNING]),
    now: () => nowRef.ms,
    persist: createExpiringStore<ProviderPoint>('test', { factory: undefined }),
  };
}

const failingDeps = (nowRef: { ms: number }) => ({
  ...makeDeps(nowRef),
  observations: vi.fn(async () => undefined),
  forecasts: vi.fn(async () => undefined),
  warnings: vi.fn(async () => undefined),
});

describe('pointConditionsKey', () => {
  it('quantizes nearby positions to the same key', () => {
    expect(pointConditionsKey('AccuWeather', 27.71, -82.69)).toBe(
      pointConditionsKey('AccuWeather', 27.74, -82.74),
    );
  });

  it('separates providers and distant positions', () => {
    expect(pointConditionsKey('AccuWeather', 27.7, -82.7)).not.toBe(
      pointConditionsKey('OpenWeather', 27.7, -82.7),
    );
    expect(pointConditionsKey('AccuWeather', 27.7, -82.7)).not.toBe(
      pointConditionsKey('AccuWeather', 28.7, -82.7),
    );
  });
});

describe('createPointConditionsLoader', () => {
  it('returns the provider answers stamped with the fetch time and persists them', async () => {
    const nowRef = { ms: 50_000 };
    const deps = makeDeps(nowRef);
    const loader = createPointConditionsLoader(deps);

    const point = await loader.load('http://pi', 'AccuWeather', 27.7, -82.7);
    expect(point.obs).toBe(OBS);
    expect(point.series).toBe(SERIES);
    expect(point.warnings).toEqual([WARNING]);
    expect(point.fetchedAt).toBe(50_000);
    expect(await deps.persist.get(pointConditionsKey('AccuWeather', 27.7, -82.7))).toBeDefined();
  });

  it('replays the persisted bundle to a fresh loader (a reload) when every fetch fails', async () => {
    const nowRef = { ms: 50_000 };
    const persist = createExpiringStore<ProviderPoint>('shared', { factory: undefined });

    const first = createPointConditionsLoader({ ...makeDeps(nowRef), persist });
    await first.load('http://pi', 'AccuWeather', 27.7, -82.7);

    nowRef.ms += 30 * 60_000; // half an hour later, still within the hour
    const second = createPointConditionsLoader({ ...failingDeps(nowRef), persist });
    const point = await second.load('http://pi', 'AccuWeather', 27.7, -82.7);
    expect(point.obs).toEqual(OBS);
    expect(point.series).toEqual(SERIES);
    expect(point.warnings).toEqual([WARNING]);
    expect(point.fetchedAt).toBe(50_000); // the replay states the original fetch time
  });

  it('does not replay a bundle past the hour expiry', async () => {
    const nowRef = { ms: 50_000 };
    const persist = createExpiringStore<ProviderPoint>('shared', { factory: undefined });

    const first = createPointConditionsLoader({ ...makeDeps(nowRef), persist });
    await first.load('http://pi', 'AccuWeather', 27.7, -82.7);

    nowRef.ms += 61 * 60_000;
    const second = createPointConditionsLoader({ ...failingDeps(nowRef), persist });
    const point = await second.load('http://pi', 'AccuWeather', 27.7, -82.7);
    expect(point.obs).toBeUndefined();
    expect(point.series).toBeUndefined();
  });

  it('keeps a fresh warnings answer over the replayed set when only conditions fail', async () => {
    const nowRef = { ms: 0 };
    const persist = createExpiringStore<ProviderPoint>('shared', { factory: undefined });
    const first = createPointConditionsLoader({ ...makeDeps(nowRef), persist });
    await first.load('http://pi', 'AccuWeather', 27.7, -82.7);

    const newWarning = { ...WARNING, type: 'Storm' };
    const second = createPointConditionsLoader({
      ...failingDeps(nowRef),
      warnings: vi.fn(async () => [newWarning]),
      persist,
    });
    const point = await second.load('http://pi', 'AccuWeather', 27.7, -82.7);
    expect(point.obs).toEqual(OBS); // the replayed conditions
    expect(point.warnings).toEqual([newWarning]); // but the warnings just fetched
  });

  it('returns an empty bundle when fetches fail and nothing is persisted', async () => {
    const loader = createPointConditionsLoader(failingDeps({ ms: 0 }));
    const point = await loader.load('http://pi', 'AccuWeather', 27.7, -82.7);
    expect(point.obs).toBeUndefined();
    expect(point.series).toBeUndefined();
    expect(point.warnings).toBeUndefined();
  });

  it('does not replay another provider or another cell', async () => {
    const nowRef = { ms: 0 };
    const persist = createExpiringStore<ProviderPoint>('shared', { factory: undefined });
    const first = createPointConditionsLoader({ ...makeDeps(nowRef), persist });
    await first.load('http://pi', 'AccuWeather', 27.7, -82.7);

    const second = createPointConditionsLoader({ ...failingDeps(nowRef), persist });
    const otherProvider = await second.load('http://pi', 'OpenWeather', 27.7, -82.7);
    expect(otherProvider.obs).toBeUndefined();
    const otherCell = await second.load('http://pi', 'AccuWeather', 28.7, -82.7);
    expect(otherCell.obs).toBeUndefined();
  });
});
