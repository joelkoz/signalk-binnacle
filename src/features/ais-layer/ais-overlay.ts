import type { AisTargets } from '$entities/ais';
import { radiansToBearing } from '$shared/lib';
import { createSymbolOverlay, type Rgba, type SymbolOverlay } from '$shared/map';
import type { SignalKStore } from '$shared/signalk';
import { AIS_ICON_ID, aisIconImage } from './ais-icon';

const SOURCE_ID = 'binnacle-ais';
const LAYER_ID = 'binnacle-ais-symbol';
const STALE_TTL_MS = 360_000;
// Staleness changes on a minutes scale, so scan for stale targets on this cadence
// rather than every animation frame.
const PRUNE_INTERVAL_MS = 5_000;
const DEFAULT_COLOR: Rgba = { r: 0xe0, g: 0xa0, b: 0x20, a: 0xff };

export function createAisOverlay(targets: AisTargets, store: SignalKStore): SymbolOverlay {
  let lastVersion = -1;
  let lastPruneAt = 0;

  function featureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: targets.list().map((target) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [target.position.longitude, target.position.latitude],
        },
        properties: {
          id: target.id,
          name: target.name ?? '',
          heading: radiansToBearing(target.headingRad) ?? radiansToBearing(target.cogRad) ?? 0,
        },
      })),
    };
  }

  function prune(): void {
    // Date.now matches the wall clock the worker stamps targets with, so staleness is
    // a real elapsed time, not a cross-thread time-origin difference.
    const t = Date.now();
    if (t - lastPruneAt < PRUNE_INTERVAL_MS) return;
    lastPruneAt = t;
    store.pruneAis(t, STALE_TTL_MS);
  }

  function shouldRefresh(): boolean {
    if (store.aisVersion === lastVersion) return false;
    lastVersion = store.aisVersion;
    return true;
  }

  return createSymbolOverlay({
    id: 'ais',
    title: 'AIS targets',
    band: 'traffic',
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    iconId: AIS_ICON_ID,
    iconImage: aisIconImage,
    defaultColor: DEFAULT_COLOR,
    paintColor: (paint) => paint.aisTarget,
    features: featureCollection,
    shouldRefresh,
    beforeSync: prune,
  });
}
