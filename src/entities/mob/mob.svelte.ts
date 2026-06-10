import type { OwnVessel } from '$entities/vessel';
import { isLatLon, type LatLon } from '$shared/geo';
import { isFiniteNumber, type ReactiveClock } from '$shared/lib';
import { haversineMeters, rhumbBearingRad } from '$shared/nav';
import { PersistedValue } from '$shared/settings';
import { type SignalKStore, SK_PATHS } from '$shared/signalk';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

// The mark this station made: where and when the person went in. Persisted so a reload during a
// recovery cannot lose the spot.
export interface MobMark {
  position: LatLon;
  epochMs: number;
}

// Notification states that mean an MOB alarm is active. 'normal' clears it.
const ALARM_STATES = new Set(['alarm', 'emergency']);

function validMark(value: MobMark | null): MobMark | null {
  if (!value || typeof value !== 'object') return null;
  if (!isLatLon(value.position) || !isFiniteNumber(value.epochMs)) return null;
  return value;
}

// Man-overboard state. A local trigger marks the vessel position and persists it; the stream's
// notifications.mob is also reflected, so an MOB raised by another station (a crew phone) raises
// the strip here, with its mark when the notification carries a position. Cancel clears only the
// local mark; a remote alarm clears when its station publishes normal.
export class MobStore {
  #store: SignalKStore;
  #vessel: OwnVessel;
  #clock: ReactiveClock | undefined;
  #persisted: PersistedValue<MobMark | null>;
  #local = $state<MobMark | null>(null);
  #acknowledged = $state(false);

  constructor(
    store: SignalKStore,
    vessel: OwnVessel,
    clock?: ReactiveClock,
    storage?: StorageLike,
  ) {
    this.#store = store;
    this.#vessel = vessel;
    this.#clock = clock;
    this.#persisted = new PersistedValue<MobMark | null>('binnacle:mob', null, storage);
    this.#local = validMark(this.#persisted.value);
    // Pre-create the cell so the first reactive read finds a tracked cell (the OwnVessel pitfall).
    store.cell(SK_PATHS.mobNotification);
  }

  #notification = $derived.by<{ state?: unknown; position?: unknown } | undefined>(() => {
    const value = this.#store.cell(SK_PATHS.mobNotification).value;
    if (!value || typeof value !== 'object') return undefined;
    return value as { state?: unknown; position?: unknown };
  });

  #remoteActive = $derived.by<boolean>(() => {
    const state = this.#notification?.state;
    return typeof state === 'string' && ALARM_STATES.has(state);
  });

  #remotePosition = $derived.by<LatLon | undefined>(() => {
    if (!this.#remoteActive) return undefined;
    const position = this.#notification?.position;
    return isLatLon(position) ? position : undefined;
  });

  get active(): boolean {
    return this.#local !== null || this.#remoteActive;
  }

  // The mark to render and steer to: this station's own, or the remote one when carried.
  get position(): LatLon | undefined {
    return this.#local?.position ?? this.#remotePosition;
  }

  // Seconds since this station's trigger. A remote alarm carries no reliable epoch, so it has none.
  get elapsedSeconds(): number | undefined {
    if (!this.#clock || !this.#local) return undefined;
    return Math.max(0, (this.#clock.now - this.#local.epochMs) / 1000);
  }

  // Live bearing (radians true) and range (meters) from the boat back to the mark.
  #bearing = $derived.by<number | undefined>(() => {
    const mark = this.position;
    const boat = this.#vessel.position;
    if (!mark || !boat) return undefined;
    return rhumbBearingRad(boat, mark);
  });

  #distance = $derived.by<number | undefined>(() => {
    const mark = this.position;
    const boat = this.#vessel.position;
    if (!mark || !boat) return undefined;
    return haversineMeters(boat.latitude, boat.longitude, mark.latitude, mark.longitude);
  });

  get bearingRad(): number | undefined {
    return this.#bearing;
  }

  get distanceMeters(): number | undefined {
    return this.#distance;
  }

  get acknowledged(): boolean {
    return this.#acknowledged;
  }

  // Mark man overboard at the current boat position. Returns the mark, or undefined without a fix
  // (the button is disabled then, so this is a backstop, not a UI path).
  trigger(): MobMark | undefined {
    const boat = this.#vessel.position;
    if (!boat) return undefined;
    // Snapshot the fix into a plain object: the store cell value is a Svelte reactive proxy, and a
    // proxy cannot be structured-cloned into the stream worker when the mark is published
    // (postMessage throws DataCloneError and the boat-wide alarm silently never goes out).
    const mark = {
      position: { latitude: boat.latitude, longitude: boat.longitude },
      epochMs: this.#clock?.now ?? 0,
    };
    this.#acknowledged = false;
    this.#setLocal(mark);
    return mark;
  }

  // Clear the local mark (recovery complete, or an accidental tap).
  cancel(): void {
    this.#acknowledged = false;
    this.#setLocal(null);
  }

  // Silence the tone; the strip and mark stay until cancelled.
  acknowledge(): void {
    this.#acknowledged = true;
  }

  #setLocal(next: MobMark | null): void {
    this.#local = next;
    this.#persisted.set(next);
  }
}
