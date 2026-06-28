/** A panel-scoped Terra Draw instance with only the rectangle mode, separate from the route
 * editor's instance (which uses prefixId 'binnacle-route-draw') so the two never conflict.
 * Emits the drawn box as a [minLng, minLat, maxLng, maxLat] tuple on finish. */

import type { Map as MapLibreMap } from 'maplibre-gl';
import { TerraDraw, TerraDrawRectangleMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { bboxFromRectangle } from './estimate.js';

export interface PrewarmRectangle {
  start(): void;
  clear(): void;
  onChange(cb: (bbox: [number, number, number, number] | null) => void): void;
  destroy(): void;
}

export function createPrewarmRectangle(map: MapLibreMap): PrewarmRectangle {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, prefixId: 'binnacle-prewarm-draw' }),
    modes: [new TerraDrawRectangleMode()],
  });

  let onChangeCb: (bbox: [number, number, number, number] | null) => void = () => {};
  let started = false;

  draw.on('finish', () => {
    const snapshot = draw.getSnapshot();
    const polygon = snapshot.find((f) => f.geometry.type === 'Polygon');
    if (!polygon) {
      onChangeCb(null);
      return;
    }
    const ring = (polygon.geometry.coordinates as number[][][])[0].map(
      (p) => [p[0], p[1]] as [number, number],
    );
    onChangeCb(bboxFromRectangle(ring));
  });

  return {
    start() {
      if (!started) {
        draw.start();
        started = true;
      }
      draw.setMode('rectangle');
    },
    clear() {
      draw.clear();
      onChangeCb(null);
    },
    onChange(cb) {
      onChangeCb = cb;
    },
    destroy() {
      if (!started) return;
      started = false;
      draw.stop();
    },
  };
}
