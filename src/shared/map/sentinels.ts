import type { Map as MapLibreMap } from 'maplibre-gl';
import { Z_ORDER, type ZBand } from './types';

export function sentinelId(band: ZBand): string {
  return `__z__${band}`;
}

export function installSentinels(map: MapLibreMap): void {
  for (const band of Z_ORDER) {
    const id = sentinelId(band);
    if (!map.getLayer(id)) {
      map.addLayer({ id, type: 'background', layout: { visibility: 'none' } });
    }
  }
}

// Precomputed O(1) lookup mirroring the Z_RANK pattern in layer-manager.ts.
const BEFORE_ID = new Map<ZBand, string | undefined>(
  Z_ORDER.map((band, i) => {
    const next = Z_ORDER[i + 1];
    return [band, next ? sentinelId(next) : undefined];
  }),
);

export function beforeIdFor(band: ZBand): string | undefined {
  return BEFORE_ID.get(band);
}
