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
        shipTypeId: this.#shipTypeId(target.values.get(SK_PATHS.aisShipType)),
        cpaMeters: this.#approachField(approach, 'distance'),
        tcpaSeconds: this.#approachField(approach, 'timeTo'),
      });
    }
    return out;
  }

  #shipTypeId(value: unknown): number | undefined {
    if (typeof value === 'object' && value !== null) {
      return asNumber((value as { id?: unknown }).id);
    }
    return undefined;
  }

  #approachField(value: unknown, field: 'distance' | 'timeTo'): number | undefined {
    if (typeof value === 'object' && value !== null) {
      return asNumber((value as Record<string, unknown>)[field]);
    }
    return undefined;
  }
}
