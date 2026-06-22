import { isLatitude, isLongitude, type MapView } from '$shared/geo';
import { isFiniteNumber, isRecord, nauticalMilesToMeters } from '$shared/lib';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(injected?: StorageLike): StorageLike | undefined {
  if (injected) return injected;
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

// A reactive value persisted to localStorage as JSON, with a default and a storage
// injection seam for tests. The field initializer is a placeholder the constructor
// immediately replaces with the read value.
export class PersistedValue<T> {
  value = $state<T>(undefined as unknown as T);

  // True when `value` was loaded from storage, false when it fell back to the default.
  // Lets a caller persist a freshly generated default only on first run.
  readonly fromStorage: boolean;

  #key: string;
  #storage: StorageLike | undefined;

  constructor(key: string, fallback: T, storage?: StorageLike) {
    this.#key = key;
    this.#storage = resolveStorage(storage);
    const read = this.#read(fallback);
    this.fromStorage = read.fromStorage;
    this.value = read.value;
  }

  set(next: T): void {
    this.value = next;
    try {
      this.#storage?.setItem(this.#key, JSON.stringify(next));
    } catch (error) {
      // A failed persist (quota exceeded, private mode) must not break the in-memory update; a
      // breadcrumb makes "my settings stopped persisting" diagnosable without breaking anything.
      console.warn(`Could not persist "${this.#key}".`, error);
    }
  }

  // Reports whether the value came from storage by key presence and a successful
  // parse, not by comparing to the default: a stored primitive equal to the default
  // is still "from storage", which a value compare would miss.
  #read(fallback: T): { value: T; fromStorage: boolean } {
    const raw = this.#storage?.getItem(this.#key);
    if (raw == null) return { value: fallback, fromStorage: false };
    try {
      return { value: JSON.parse(raw) as T, fromStorage: true };
    } catch {
      return { value: fallback, fromStorage: false };
    }
  }
}

// Guards a stored view against corruption: a NaN or out-of-range center would break the map.
export function isMapView(value: unknown): value is MapView {
  if (!isRecord(value)) return false;
  return (
    isLatitude(value.lat) &&
    isLongitude(value.lon) &&
    isFiniteNumber(value.zoom) &&
    value.zoom >= 0 &&
    value.zoom <= 24
  );
}

export function createMapView(
  key = 'binnacle:map-view',
  storage?: StorageLike,
): PersistedValue<MapView | null> {
  return new PersistedValue(key, null, storage);
}

// Track recording policy and rendering preference, persisted across visits.
export interface TrackSettings {
  intervalSeconds: number;
  minMeters: number;
  colorMode: 'speed' | 'solid';
}

export const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  intervalSeconds: 10,
  minMeters: 10,
  colorMode: 'speed',
};

export function createTrackSettings(storage?: StorageLike): PersistedValue<TrackSettings> {
  return new PersistedValue('binnacle:track-settings', DEFAULT_TRACK_SETTINGS, storage);
}

export interface Thresholds {
  dangerCpaMeters: number;
  dangerTcpaSeconds: number;
  warningCpaMeters: number;
  warningTcpaSeconds: number;
}

const MINUTE_S = 60;

export const DEFAULT_THRESHOLDS: Thresholds = {
  dangerCpaMeters: Math.round(nauticalMilesToMeters(0.5)),
  dangerTcpaSeconds: 10 * MINUTE_S,
  warningCpaMeters: Math.round(nauticalMilesToMeters(1)),
  warningTcpaSeconds: 20 * MINUTE_S,
};

export function createThresholds(storage?: StorageLike): PersistedValue<Thresholds> {
  return new PersistedValue('binnacle:lookout-thresholds', DEFAULT_THRESHOLDS, storage);
}
