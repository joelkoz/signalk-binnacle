import { asNumber, isLatLon, type LatLon } from '$shared/geo';
import type { ReactiveClock } from '$shared/lib';
import { type SignalKStore, SK_PATHS } from '$shared/signalk';

// How long the own-vessel fix may go without a position update before it is treated as lost. The
// position is subscribed near 1 Hz, so a gap this long is a real dropout, not stream jitter. Holding
// a frozen fix out as if it were live is the worst lie to tell a navigator, so the readouts, the nav
// guidance, and the collision math all degrade once the fix ages past this.
const FIX_STALE_MS = 10_000;

export class OwnVessel {
  #store: SignalKStore;
  #clock: ReactiveClock | undefined;

  constructor(store: SignalKStore, clock?: ReactiveClock) {
    this.#store = store;
    this.#clock = clock;
    // Pre-create the cells this vessel reads. The store creates a cell lazily on first
    // access; if that first access is a reactive template read, the freshly created
    // $state source is not tracked and later updates do not re-render. Creating the
    // cells up front means every read finds an existing, tracked cell.
    for (const path of [
      SK_PATHS.position,
      SK_PATHS.speedOverGround,
      SK_PATHS.courseOverGroundTrue,
      SK_PATHS.headingTrue,
      SK_PATHS.depthBelowTransducer,
      SK_PATHS.windSpeedApparent,
      SK_PATHS.outsidePressure,
    ]) {
      store.cell(path);
    }
  }

  // Speed over ground in m/s (SI). Consumers convert to knots at the display edge.
  get sogMps(): number | undefined {
    return asNumber(this.#raw(SK_PATHS.speedOverGround));
  }

  // Course over ground in radians (SI). Display converts to a compass bearing at its edge.
  get cogRad(): number | undefined {
    return asNumber(this.#raw(SK_PATHS.courseOverGroundTrue));
  }

  // Heading (true) in radians (SI).
  get headingRad(): number | undefined {
    return asNumber(this.#raw(SK_PATHS.headingTrue));
  }

  // Depth below the transducer in meters (SI), when a sounder publishes it.
  get depthMeters(): number | undefined {
    return asNumber(this.#raw(SK_PATHS.depthBelowTransducer));
  }

  // Apparent wind speed in m/s (SI), when an anemometer publishes it.
  get windSpeedApparentMps(): number | undefined {
    return asNumber(this.#raw(SK_PATHS.windSpeedApparent));
  }

  // Outside air pressure in Pascals (SI), when a barometer publishes it.
  get outsidePressurePa(): number | undefined {
    return asNumber(this.#raw(SK_PATHS.outsidePressure));
  }

  get position(): LatLon | undefined {
    const value = this.#raw(SK_PATHS.position);
    return isLatLon(value) ? value : undefined;
  }

  // True when a fix was once received but has not refreshed within FIX_STALE_MS, so the last
  // position is no longer trustworthy. False before the first fix (absent, not stale) and false
  // when no clock is wired (tests, and any caller that does not need staleness). Reads the ticking
  // clock, so it flips on its own the moment the feed stops, without a fresh frame to trigger it.
  #stale = $derived.by<boolean>(() => {
    if (!this.#clock) return false;
    const epoch = this.#store.cell(SK_PATHS.position).epoch;
    if (epoch === 0) return false;
    return this.#clock.now - epoch > FIX_STALE_MS;
  });

  get positionStale(): boolean {
    return this.#stale;
  }

  #raw(path: string): unknown {
    return this.#store.cell(path).value;
  }
}
