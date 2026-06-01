import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import { asNumber, isLatLon, type LatLon, type SignalKStore, SK_PATHS } from '$shared/signalk';

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

  get sogKnots(): number | undefined {
    return metersPerSecondToKnots(asNumber(this.#raw(SK_PATHS.speedOverGround)));
  }

  get cogDegrees(): number | undefined {
    return radiansToDegrees(asNumber(this.#raw(SK_PATHS.courseOverGroundTrue)));
  }

  get headingDegrees(): number | undefined {
    return radiansToDegrees(asNumber(this.#raw(SK_PATHS.headingTrue)));
  }

  get position(): LatLon | undefined {
    const value = this.#raw(SK_PATHS.position);
    return isLatLon(value) ? value : undefined;
  }

  #raw(path: string): unknown {
    return this.#store.cell(path).value;
  }
}
