import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import { type SignalKStore, SK_PATHS } from '$shared/signalk';

export interface LatLon {
  latitude: number;
  longitude: number;
}

export class OwnVessel {
  #store: SignalKStore;

  constructor(store: SignalKStore) {
    this.#store = store;
  }

  get sogKnots(): number | undefined {
    return metersPerSecondToKnots(this.#number(SK_PATHS.speedOverGround));
  }

  get cogDegrees(): number | undefined {
    return radiansToDegrees(this.#number(SK_PATHS.courseOverGroundTrue));
  }

  get headingDegrees(): number | undefined {
    return radiansToDegrees(this.#number(SK_PATHS.headingTrue));
  }

  get position(): LatLon | undefined {
    const value = this.#raw(SK_PATHS.position);
    return this.#isLatLon(value) ? value : undefined;
  }

  #raw(path: string): unknown {
    return this.#store.cell(path).value;
  }

  #number(path: string): number | undefined {
    const value = this.#raw(path);
    return typeof value === 'number' ? value : undefined;
  }

  #isLatLon(value: unknown): value is LatLon {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as LatLon).latitude === 'number' &&
      typeof (value as LatLon).longitude === 'number'
    );
  }
}
