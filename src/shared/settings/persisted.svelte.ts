type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(injected?: StorageLike): StorageLike | undefined {
  if (injected) return injected;
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

// A reactive value persisted to localStorage as JSON, with a default and a storage
// injection seam for tests. Mirrors the theme controller's persistence shape.
export class PersistedValue<T> {
  value = $state<T>(undefined as unknown as T);

  #key: string;
  #storage: StorageLike | undefined;

  constructor(key: string, fallback: T, storage?: StorageLike) {
    this.#key = key;
    this.#storage = resolveStorage(storage);
    this.value = this.#read(fallback);
  }

  set(next: T): void {
    this.value = next;
    this.#storage?.setItem(this.#key, JSON.stringify(next));
  }

  #read(fallback: T): T {
    const raw = this.#storage?.getItem(this.#key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
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
