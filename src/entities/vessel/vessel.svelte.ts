import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import { asNumber, isLatLon, type LatLon, type SignalKStore, SK_PATHS } from '$shared/signalk';

export class OwnVessel {
  #store: SignalKStore;

  constructor(store: SignalKStore) {
    this.#store = store;
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
