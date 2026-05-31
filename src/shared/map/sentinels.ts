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

export function beforeIdFor(band: ZBand): string | undefined {
  const next = Z_ORDER[Z_ORDER.indexOf(band) + 1];
  return next ? sentinelId(next) : undefined;
}
