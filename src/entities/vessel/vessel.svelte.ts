import { asNumber, isLatLon, type LatLon } from '$shared/geo';
import { type SignalKStore, SK_PATHS } from '$shared/signalk';

export class OwnVessel {
  #store: SignalKStore;

  constructor(store: SignalKStore) {
    this.#store = store;
    // Pre-create the cells this vessel reads. The store creates a cell lazily on first
    // access; if that first access is a reactive template read, the freshly created
    // $state source is not tracked and later updates do not re-render. Creating the
    // cells up front means every read finds an existing, tracked cell.
    for (const path of [
      SK_PATHS.position,
      SK_PATHS.speedOverGround,
      SK_PATHS.courseOverGroundTrue,
      SK_PATHS.headingTrue,
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

  get position(): LatLon | undefined {
    const value = this.#raw(SK_PATHS.position);
    return isLatLon(value) ? value : undefined;
  }

  #raw(path: string): unknown {
    return this.#store.cell(path).value;
  }
}
