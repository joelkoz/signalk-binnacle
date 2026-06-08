import type {
  CustomLayerInterface,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import { prefersReducedMotion } from '$shared/lib';
import { emptyFeatureCollection, type OverlayContext, type OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import { WEATHER_LAYER_IDS } from './fills';
import { windArrowFeatures } from './wind-arrows';
import { windColorTexture } from './wind-color-texture';
import { windColorExpression } from './wind-colormap';
import { windFieldTexture } from './wind-field-texture';
import { supportsWindGl, WindParticles } from './wind-gl/wind-particles';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

const SOURCE_ID = 'binnacle-weather-wind';
const LAYER_ID = 'binnacle-weather-wind-line';
const GL_LAYER_ID = 'binnacle-weather-wind-particles';

export interface WindOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// MapLibre 5 passes a render-args object carrying the projection matrix; older builds pass the
// matrix directly. Accept both.
function matrixOf(args: unknown): number[] {
  if (Array.isArray(args)) return args;
  const data = (args as { defaultProjectionData?: { mainMatrix?: number[] } })
    .defaultProjectionData;
  return data?.mainMatrix ?? [];
}

function sameMatrix(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// The wind layer: an animated WebGL particle field advected through the forecast u/v, colored by
// speed with fading trails, in the weather band. Off by default. Falls back to a per-cell arrow line
// layer when WebGL is unavailable. Rebuilds the wind texture only when the grid or selected time
// changes; the animation runs in the custom layer's own render loop via triggerRepaint.
export function createWindOverlay(store: WeatherStore): WindOverlay {
  // The animated particle field is a continuous, self-driving render loop, so a reduced-motion
  // preference falls back to the static arrow layer (which still conveys wind direction and speed).
  // This mirrors the camera moves, which also honor prefersReducedMotion.
  const useParticles = supportsWindGl() && !prefersReducedMotion();
  let theme: Theme = 'day';
  let opacity = 1;
  let visible = false;
  let lastGrid: unknown;
  let lastTime = Number.NaN;

  // Particle path.
  let particles: WindParticles | undefined;
  let lastMatrix: number[] = [];

  // Arrow fallback path.
  function colorExpr(t: Theme): ExpressionSpecification {
    return windColorExpression(t) as unknown as ExpressionSpecification;
  }

  function addArrowLayer(ctx: OverlayContext): void {
    if (!ctx.map.getSource(SOURCE_ID)) {
      const source: GeoJSONSourceSpecification = {
        type: 'geojson',
        data: emptyFeatureCollection(),
      };
      ctx.map.addSource(SOURCE_ID, source);
    }
    if (!ctx.map.getLayer(LAYER_ID)) {
      const layer: LineLayerSpecification = {
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', visibility: visible ? 'visible' : 'none' },
        paint: { 'line-color': colorExpr(theme), 'line-width': 2, 'line-opacity': opacity },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
    }
  }

  function syncArrows(ctx: OverlayContext): void {
    const grid = store.grid;
    const source = ctx.map.getSource(SOURCE_ID) as { setData(d: unknown): void } | undefined;
    source?.setData(grid ? windArrowFeatures(grid, store.bracket) : emptyFeatureCollection());
  }

  function pushWind(): void {
    if (!particles) return;
    const grid = store.grid;
    const field = grid ? windFieldTexture(grid, store.bracket) : undefined;
    if (field) particles.setWind(field);
  }

  function addParticleLayer(ctx: OverlayContext): void {
    const layer: CustomLayerInterface = {
      id: GL_LAYER_ID,
      type: 'custom',
      onAdd(_map: MapLibreMap, gl: GL) {
        try {
          particles = new WindParticles(gl);
          particles.setTheme(windColorTexture(theme));
          particles.setOpacity(opacity);
          pushWind();
        } catch (error) {
          // A rare secondary failure after the probe passed: degrade to arrows. The empty custom
          // layer stays but renders nothing because `particles` is undefined.
          console.warn('[wind] particle init failed, using arrows', error);
          particles = undefined;
          addArrowLayer(ctx);
          syncArrows(ctx);
        }
      },
      render(gl: GL, args: unknown) {
        if (!particles || !visible) return;
        const matrix = matrixOf(args);
        if (matrix.length < 16) return; // unrecognized render args; MapLibre 5 gives a 4x4 matrix
        const moved = !sameMatrix(matrix, lastMatrix);
        lastMatrix = matrix;
        particles.render(matrix, gl.drawingBufferWidth, gl.drawingBufferHeight, moved);
        ctx.map.triggerRepaint();
      },
      onRemove() {
        particles?.dispose();
        particles = undefined;
      },
    };
    ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
  }

  return {
    id: WEATHER_LAYER_IDS.wind,
    title: 'Wind',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    // Both candidate ids: the particle layer normally, the arrow layer when WebGL is unavailable or
    // a secondary init failure degraded to it. The LayerManager guards each id with getLayer, so the
    // absent one is skipped and a restack never drops the one that is present.
    layerIds: [GL_LAYER_ID, LAYER_ID],
    add(ctx) {
      // Reset the dirty-check so a re-add after a base-style swap repopulates the source. Without
      // this the arrow fallback stays blank when the grid object is unchanged, the same hazard
      // radar-overlay guards against.
      lastGrid = undefined;
      lastTime = Number.NaN;
      if (useParticles) addParticleLayer(ctx);
      else addArrowLayer(ctx);
    },
    sync(ctx) {
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      pushWind(); // a no-op without particles
      if (!particles && ctx.map.getLayer(LAYER_ID)) syncArrows(ctx);
    },
    remove(ctx) {
      if (ctx.map.getLayer(GL_LAYER_ID)) ctx.map.removeLayer(GL_LAYER_ID);
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, value) {
      visible = value;
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setLayoutProperty(LAYER_ID, 'visibility', value ? 'visible' : 'none');
      }
      // Restart the particle render loop when turned on; render() stops requesting frames when off.
      if (value) ctx.map.triggerRepaint();
    },
    setOpacity(ctx, value) {
      opacity = value;
      particles?.setOpacity(value);
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.setPaintProperty(LAYER_ID, 'line-opacity', value);
    },
    applyTheme(ctx, paint) {
      theme = paint.theme;
      particles?.setTheme(windColorTexture(theme));
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setPaintProperty(LAYER_ID, 'line-color', colorExpr(theme));
      }
    },
  };
}
