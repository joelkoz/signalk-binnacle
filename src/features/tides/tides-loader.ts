import type {
  CurrentEvent,
  CurrentReading,
  TideEvent,
  TideReading,
  TideStation,
  TidesStore,
} from '$entities/tides';
import { DAY_MS, MINUTE_MS } from '$shared/lib';
import { haversineMeters } from '$shared/nav';
import { MemoryCache } from '$shared/storage';
import {
  fetchCurrentEvents,
  fetchCurrentStations,
  fetchTideEvents,
  fetchTideStations,
  utcYmd,
} from './coops-client';
import { fetchSignalkTidesReading } from './signalk-tides-client';
import { nearestStations } from './station-proximity';

interface LoaderDeps {
  tideStations: () => Promise<TideStation[]>;
  currentStations: () => Promise<TideStation[]>;
  tideEvents: (stationId: string) => Promise<TideEvent[]>;
  currentEvents: (stationId: string) => Promise<CurrentEvent[]>;
  now: () => number;
  // Whether the signalk-tides plugin is installed and enabled on the server. The host wires this
  // from the server's feature discovery; the default never prefers the plugin, so a stock server
  // gets CO-OPS exactly as before.
  pluginAvailable: () => boolean;
  // The plugin's tide reading for the vessel's position, or undefined when it has nothing to give.
  pluginTides: (lat: number, lon: number) => Promise<TideReading | undefined>;
}

export interface TidesLoader {
  load(store: TidesStore, lat: number, lon: number): Promise<void>;
}

// A tide station up to 100 km away is still a useful approximation; a tidal-current station is a
// local feature, so it uses a tighter radius.
const TIDE_RADIUS_M = 100_000;
const CURRENT_RADIUS_M = 60_000;
// How many of the nearest current stations to try before giving up on a current reading. Several
// of the very nearest are often reference-only points that serve no predictions, so this is generous.
const CURRENT_TRIES = 6;
// The station lists are nearly static, so they refresh once a day. After a failed fetch, back off
// before retrying so a flaky network is not hammered.
const STATIONS_TTL_MS = DAY_MS;
const COOLDOWN_MS = 5 * MINUTE_MS;
// A backstop on the per-station event caches so a long session of panning cannot grow them forever.
const MAX_EVENT_ENTRIES = 24;
// Skip a reload when the view barely moved and a reading is already on screen, so small pans do not
// flicker the panel or rerun the nearest-station search.
const SKIP_RADIUS_M = 3000;

const realDeps: LoaderDeps = {
  tideStations: fetchTideStations,
  currentStations: fetchCurrentStations,
  tideEvents: fetchTideEvents,
  currentEvents: fetchCurrentEvents,
  now: () => Date.now(),
  pluginAvailable: () => false,
  pluginTides: (lat, lon) => fetchSignalkTidesReading(lat, lon),
};

// The per-station event cache rolls over on the UTC day, matching the CO-OPS fetch window (both
// derive from utcYmd), so the cache and the window roll over at the same UTC-midnight instant.
const dayKey = (ms: number): string => utcYmd(ms, '-');

// A tides loader with its own session caches: the station lists are fetched once a day, and each
// station's events are kept for the day so panning back to a covered area is instant. It feeds the
// nearest tide and current readings into the store, or flags no coverage outside US waters.
export function createTidesLoader(overrides: Partial<LoaderDeps> = {}): TidesLoader {
  const deps = { ...realDeps, ...overrides };
  let tideList: TideStation[] | undefined;
  let currentList: TideStation[] | undefined;
  let listsAt = 0;
  // Bounded per-station caches with the default infinite TTL: the day field invalidates an entry, so
  // a non-current entry is refetched rather than expired by time. MemoryCache only caps the size.
  const tideEventCache = new MemoryCache<{ events: TideEvent[]; day: string }>(MAX_EVENT_ENTRIES);
  const currentEventCache = new MemoryCache<{ events: CurrentEvent[]; day: string }>(
    MAX_EVENT_ENTRIES,
  );
  let cooldownUntil = 0;
  let inFlight = false;
  let lastLat: number | undefined;
  let lastLon: number | undefined;
  // The day of the last load, so an anchored boat still refetches after midnight when the
  // 48-hour event window would otherwise age out behind the skip radius.
  let lastDay: string | undefined;

  async function ensureLists(nowMs: number): Promise<void> {
    if (tideList && currentList && nowMs - listsAt < STATIONS_TTL_MS) return;
    const [tides, currents] = await Promise.all([deps.tideStations(), deps.currentStations()]);
    tideList = tides;
    currentList = currents;
    listsAt = nowMs;
  }

  // The nearest current station is often a reference-only point that serves no predictions, so
  // try the nearest few and take the first that actually returns events.
  async function nearestCurrent(
    lat: number,
    lon: number,
    nowMs: number,
    day: string,
  ): Promise<CurrentReading | undefined> {
    const nearCurrents = nearestStations(
      currentList ?? [],
      lat,
      lon,
      CURRENT_TRIES,
      CURRENT_RADIUS_M,
    );
    for (const candidate of nearCurrents) {
      let currentEntry = currentEventCache.get(candidate.station.id, nowMs);
      if (!currentEntry || currentEntry.day !== day) {
        currentEntry = { events: await deps.currentEvents(candidate.station.id), day };
        currentEventCache.put(candidate.station.id, currentEntry, nowMs);
      }
      if (currentEntry.events.length > 0) {
        return {
          station: candidate.station,
          distanceMeters: candidate.distanceMeters,
          events: currentEntry.events,
        };
      }
    }
    return undefined;
  }

  // Tidal currents still come from CO-OPS even when the plugin serves the tide (the plugin carries
  // only tide heights), but a CO-OPS failure must not take down a plugin-served reading, so this
  // degrades to no current instead of throwing.
  async function nearestCurrentSafely(
    lat: number,
    lon: number,
    nowMs: number,
    day: string,
  ): Promise<CurrentReading | undefined> {
    try {
      await ensureLists(nowMs);
      return await nearestCurrent(lat, lon, nowMs, day);
    } catch {
      return undefined;
    }
  }

  return {
    async load(store, lat, lon) {
      const nowMs = deps.now();
      if (inFlight || nowMs < cooldownUntil) return;
      const settled = store.status === 'ready' || store.status === 'no-coverage';
      if (settled && lastLat !== undefined && lastLon !== undefined && dayKey(nowMs) === lastDay) {
        if (haversineMeters(lastLat, lastLon, lat, lon) < SKIP_RADIUS_M) return;
      }
      inFlight = true;
      store.setLoading();
      try {
        const day = dayKey(nowMs);
        // Prefer the signalk-tides plugin when the server has it; anything it cannot answer
        // (mid-start, no position fix, outside its sources' coverage) falls through to CO-OPS,
        // including a rejection from an injected pluginTides. The plugin answers for the vessel's
        // position, so when the viewed point is beyond the same usefulness radius CO-OPS stations
        // get, fall through too: a pan to a far coast should show that coast, not the boat's tides.
        if (deps.pluginAvailable()) {
          const pluginTide = await deps.pluginTides(lat, lon).catch(() => undefined);
          if (pluginTide && pluginTide.distanceMeters <= TIDE_RADIUS_M) {
            lastLat = lat;
            lastLon = lon;
            lastDay = day;
            const current = await nearestCurrentSafely(lat, lon, nowMs, day);
            store.setReadings(pluginTide, current, 'signalk-tides');
            return;
          }
        }
        await ensureLists(nowMs);
        lastLat = lat;
        lastLon = lon;
        lastDay = day;
        const nearTide = nearestStations(tideList ?? [], lat, lon, 1, TIDE_RADIUS_M)[0];
        if (!nearTide) {
          store.setNoCoverage();
          return;
        }
        let tideEntry = tideEventCache.get(nearTide.station.id, nowMs);
        if (!tideEntry || tideEntry.day !== day) {
          tideEntry = { events: await deps.tideEvents(nearTide.station.id), day };
          tideEventCache.put(nearTide.station.id, tideEntry, nowMs);
        }
        const tide: TideReading = {
          station: nearTide.station,
          distanceMeters: nearTide.distanceMeters,
          events: tideEntry.events,
        };

        const current = await nearestCurrent(lat, lon, nowMs, day);
        store.setReadings(tide, current, 'noaa-coops');
      } catch {
        cooldownUntil = deps.now() + COOLDOWN_MS;
        store.setError();
      } finally {
        inFlight = false;
      }
    },
  };
}
