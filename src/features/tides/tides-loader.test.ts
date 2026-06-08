import { describe, expect, it, vi } from 'vitest';
import { TidesStore } from '$entities/tides';
import { createTidesLoader } from './tides-loader';

const tideStation = { id: 'T1', name: 'Tide', latitude: 27.7, longitude: -82.7 };
const currentStation = { id: 'C1', name: 'Current', latitude: 27.7, longitude: -82.7 };
const tideEvents = [{ timeMs: 1000, heightMeters: 0.5, kind: 'high' as const }];
const currentEvents = [
  { timeMs: 1000, velocityMps: 0.5, directionDeg: 100, kind: 'flood' as const },
];

function deps(overrides: Record<string, unknown> = {}) {
  return {
    tideStations: vi.fn(async () => [tideStation]),
    currentStations: vi.fn(async () => [currentStation]),
    tideEvents: vi.fn(async () => tideEvents),
    currentEvents: vi.fn(async () => currentEvents),
    now: () => 1_000_000,
    ...overrides,
  };
}

describe('createTidesLoader', () => {
  it('loads the nearest tide and current readings and sets ready', async () => {
    const loader = createTidesLoader(deps());
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('ready');
    expect(store.tide?.station.id).toBe('T1');
    expect(store.current?.station.id).toBe('C1');
  });

  it('reuses cached station lists and events on a second nearby load', async () => {
    const d = deps();
    const loader = createTidesLoader(d);
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    await loader.load(store, 27.71, -82.71);
    expect(d.tideStations).toHaveBeenCalledTimes(1);
    expect(d.tideEvents).toHaveBeenCalledTimes(1);
  });

  it('flags no coverage when no station is within range', async () => {
    const loader = createTidesLoader(
      deps({
        tideStations: vi.fn(async () => [{ id: 'X', name: 'Far', latitude: 0, longitude: 0 }]),
      }),
    );
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('no-coverage');
  });

  it('keeps prior data and flags an error on a fetch failure', async () => {
    const loader = createTidesLoader(
      deps({
        tideStations: vi.fn(async () => {
          throw new Error('network');
        }),
      }),
    );
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('error');
  });
});
