import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import type { LatLon, SignalKStore } from '$shared/signalk';
import { asNumber, isLatLon, SK_PATHS } from '$shared/signalk';

export interface AisTargetView {
  id: string;
  name?: string;
  position: LatLon;
  cogDegrees?: number;
  headingDegrees?: number;
  sogKnots?: number;
  shipTypeId?: number;
  cpaMeters?: number;
  tcpaSeconds?: number;
}

export class AisTargets {
  #store: SignalKStore;
  #cache: AisTargetView[] | undefined;
  #cacheVersion = -1;

  constructor(store: SignalKStore) {
    this.#store = store;
  }

  // Reading this in a reactive context takes a dependency on AIS changes, since the
  // store bumps aisVersion ($state) on every AIS update and prune. list() iterates a
  // non-reactive Map, so a consumer that needs to re-render must read this too.
  get version(): number {
    return this.#store.aisVersion;
  }

  list(): AisTargetView[] {
    // Rebuild only when AIS data changed. With aisVersion bumped only on real AIS
    // updates, own-vessel motion no longer forces a full list rebuild on consumers.
    const version = this.#store.aisVersion;
    if (this.#cache && this.#cacheVersion === version) return this.#cache;
    const out: AisTargetView[] = [];
    for (const [id, target] of this.#store.aisTargets) {
      const position = target.values.get(SK_PATHS.position);
      if (!isLatLon(position)) continue;
      const name = target.values.get(SK_PATHS.name);
      const approach = target.values.get(SK_PATHS.closestApproach);
      out.push({
        id,
        name: typeof name === 'string' ? name : undefined,
        position,
        cogDegrees: radiansToDegrees(asNumber(target.values.get(SK_PATHS.courseOverGroundTrue))),
        headingDegrees: radiansToDegrees(asNumber(target.values.get(SK_PATHS.headingTrue))),
        sogKnots: metersPerSecondToKnots(asNumber(target.values.get(SK_PATHS.speedOverGround))),
        shipTypeId: this.#numField(target.values.get(SK_PATHS.aisShipType), 'id'),
        cpaMeters: this.#numField(approach, 'distance'),
        tcpaSeconds: this.#numField(approach, 'timeTo'),
      });
    }
    this.#cache = out;
    this.#cacheVersion = version;
    return out;
  }

  #numField(value: unknown, key: string): number | undefined {
    if (typeof value === 'object' && value !== null) {
      return asNumber((value as Record<string, unknown>)[key]);
    }
    return undefined;
  }
}
