type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

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
    this.#storage?.setItem(this.#key, JSON.stringify(next));
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

// The map's saved center and zoom, restored on the next visit.
export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Guards a stored view against corruption: a NaN or out-of-range center would break the map.
export function isMapView(value: unknown): value is MapView {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isFiniteNumber(v.lat) &&
    v.lat >= -90 &&
    v.lat <= 90 &&
    isFiniteNumber(v.lon) &&
    v.lon >= -180 &&
    v.lon <= 180 &&
    isFiniteNumber(v.zoom) &&
    v.zoom >= 0 &&
    v.zoom <= 24
  );
}

export function createMapView(storage?: StorageLike): PersistedValue<MapView | null> {
  return new PersistedValue('binnacle:map-view', null, storage);
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

export const DEFAULT_THRESHOLDS: Thresholds = {
  dangerCpaMeters: 926, // 0.5 nm
  dangerTcpaSeconds: 600, // 10 min
  warningCpaMeters: 1852, // 1 nm
  warningTcpaSeconds: 1200, // 20 min
};

export function createThresholds(storage?: StorageLike): PersistedValue<Thresholds> {
  return new PersistedValue('binnacle:lookout-thresholds', DEFAULT_THRESHOLDS, storage);
}
