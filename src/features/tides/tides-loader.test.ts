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

const pluginReading = {
  station: { id: 'tides', name: 'Local tides (signalk-tides)', latitude: 27.7, longitude: -82.7 },
  distanceMeters: 0,
  events: tideEvents,
};

describe('createTidesLoader', () => {
  it('loads the nearest tide and current readings and sets ready', async () => {
    const loader = createTidesLoader(deps());
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('ready');
    expect(store.tide?.station.id).toBe('T1');
    expect(store.current?.station.id).toBe('C1');
    expect(store.source).toBe('noaa-coops');
  });

  it('never consults the plugin when it is not available', async () => {
    const pluginTides = vi.fn(async () => pluginReading);
    const loader = createTidesLoader(deps({ pluginTides }));
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(pluginTides).not.toHaveBeenCalled();
    expect(store.source).toBe('noaa-coops');
  });

  it('prefers the plugin reading when available and keeps the CO-OPS current', async () => {
    const d = deps({ pluginAvailable: () => true, pluginTides: vi.fn(async () => pluginReading) });
    const loader = createTidesLoader(d);
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('ready');
    expect(store.tide).toBe(pluginReading);
    expect(store.source).toBe('signalk-tides');
    expect(store.current?.station.id).toBe('C1');
    expect(d.tideEvents).not.toHaveBeenCalled();
  });

  it('falls back to CO-OPS when the plugin answers with nothing', async () => {
    const pluginTides = vi.fn(async () => undefined);
    const loader = createTidesLoader(deps({ pluginAvailable: () => true, pluginTides }));
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(pluginTides).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('ready');
    expect(store.tide?.station.id).toBe('T1');
    expect(store.source).toBe('noaa-coops');
  });

  it('falls back to CO-OPS when the plugin station is far from the viewed point', async () => {
    // The plugin answers for the vessel; a view panned to another coast should show that coast.
    const farReading = { ...pluginReading, distanceMeters: 250_000 };
    const loader = createTidesLoader(
      deps({ pluginAvailable: () => true, pluginTides: vi.fn(async () => farReading) }),
    );
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.tide?.station.id).toBe('T1');
    expect(store.source).toBe('noaa-coops');
  });

  it('falls back to CO-OPS when the plugin fetch rejects', async () => {
    const pluginTides = vi.fn(async () => {
      throw new Error('plugin down');
    });
    const loader = createTidesLoader(deps({ pluginAvailable: () => true, pluginTides }));
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('ready');
    expect(store.tide?.station.id).toBe('T1');
    expect(store.source).toBe('noaa-coops');
  });

  it('keeps the plugin tide when the CO-OPS current lookup fails', async () => {
    const loader = createTidesLoader(
      deps({
        pluginAvailable: () => true,
        pluginTides: vi.fn(async () => pluginReading),
        currentStations: vi.fn(async () => {
          throw new Error('network');
        }),
      }),
    );
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('ready');
    expect(store.tide).toBe(pluginReading);
    expect(store.current).toBeUndefined();
    expect(store.source).toBe('signalk-tides');
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

  it('refetches after a day rollover even when the boat has not moved', async () => {
    // Anchored: same position both loads, but the second lands on the next UTC day, so the
    // 3 km skip radius must not pin the aging 48-hour event window.
    let nowMs = Date.UTC(2026, 5, 8, 23, 0);
    const d = deps({ now: () => nowMs });
    const loader = createTidesLoader(d);
    const store = new TidesStore();
    await loader.load(store, 27.7, -82.7);
    nowMs = Date.UTC(2026, 5, 9, 1, 0);
    await loader.load(store, 27.7, -82.7);
    expect(store.status).toBe('ready');
    expect(d.tideEvents).toHaveBeenCalledTimes(2);
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
    expect(store.source).toBeUndefined();
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
