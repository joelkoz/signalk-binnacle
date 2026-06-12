import { isFiniteNumber, uuidv4 } from '$shared/lib';
import { readPmtilesMeta, type SignalKChart } from '$shared/map';

// A chart the user imported by URL, persisted as a descriptor pointing at a remote archive. Both
// vector and raster archives are supported. Local .pmtiles files are served by the
// signalk-pmtiles-plugin as ordinary chart resources, so there is no browser-local file origin.
export interface UserChartSource {
  id: string;
  name: string;
  kind: 'vector' | 'raster';
  origin: { type: 'url'; url: string };
  bounds?: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
  layers?: string[];
}

// Guards a persisted chart descriptor against schema drift across releases: a renamed or removed
// field would otherwise flow in as undefined and surface deep in rendering (or as a NaN passed to
// fitBounds). A descriptor that fails the guard is dropped at load rather than trusted. Rejecting
// non-url origins here also silently drops the browser-local file charts of older builds, whose
// blobs no longer have a store.
export function isUserChartSource(value: unknown): value is UserChartSource {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return false;
  if (v.kind !== 'vector' && v.kind !== 'raster') return false;
  const origin = v.origin;
  if (!origin || typeof origin !== 'object') return false;
  const o = origin as Record<string, unknown>;
  if (o.type !== 'url' || typeof o.url !== 'string') return false;
  if (
    v.bounds !== undefined &&
    (!Array.isArray(v.bounds) || v.bounds.length !== 4 || !v.bounds.every(isFiniteNumber))
  ) {
    return false;
  }
  return true;
}

// A staged import: the resolved descriptor, not yet saved. Staging reads the PMTiles metadata so
// the user can review and rename before save.
export interface DraftChart {
  source: UserChartSource;
}

// Build the SignalKChart the existing chart overlay renders, with the tile url already resolved to
// a remote .pmtiles URL.
export function userChartToSignalK(source: UserChartSource, url: string): SignalKChart {
  const vector = source.kind !== 'raster';
  return {
    identifier: source.id,
    name: source.name,
    type: vector ? 'tileJSON' : 'tilelayer',
    format: vector ? 'mvt' : 'png',
    url,
    ...(source.bounds ? { bounds: source.bounds } : {}),
    ...(source.minzoom !== undefined ? { minzoom: source.minzoom } : {}),
    ...(source.maxzoom !== undefined ? { maxzoom: source.maxzoom } : {}),
    ...(source.layers ? { layers: source.layers } : {}),
  };
}

// The chart's zoom span as a "min to max" string for the spec readouts, with sensible fallbacks when
// a bound is missing (a chart may declare only a min). Shared by the import-review and detail panels.
export function zoomRange(source: UserChartSource): string {
  return `${source.minzoom ?? 0} to ${source.maxzoom ?? source.minzoom ?? 0}`;
}

function nameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const file = path.slice(path.lastIndexOf('/') + 1);
    return file.replace(/\.pmtiles$/i, '') || url;
  } catch {
    return url;
  }
}

export class UserCharts {
  sources = $state<UserChartSource[]>([]);

  #persist: (sources: UserChartSource[]) => void;
  // Fires only when the user commits an imported chart, never for the persisted set restored at
  // startup, so the app can fly the map to a freshly imported chart and sync it to the server.
  #onAdd?: (source: UserChartSource) => void;
  // Fires when a chart is removed, so the app can also delete its server-registered resource. Runs
  // before the local descriptor is dropped, so the source is still available to the handler.
  #onRemove?: (source: UserChartSource) => void;
  // Fires with the updated descriptor after a rename, so the app can re-register the overlay
  // under the new title and re-put the server-synced chart's resource.
  #onRename?: (source: UserChartSource) => void;

  constructor(
    persisted: UserChartSource[],
    persist: (sources: UserChartSource[]) => void,
    onAdd?: (source: UserChartSource) => void,
    onRemove?: (source: UserChartSource) => void,
    onRename?: (source: UserChartSource) => void,
  ) {
    // Drop any persisted descriptor that no longer matches the schema, so a drifted entry from an
    // older build cannot flow in as a partly-undefined source. This also drops the file-origin
    // charts of older builds, whose browser-local blobs are gone with the file import path.
    this.sources = persisted.filter(isUserChartSource);
    this.#persist = persist;
    this.#onAdd = onAdd;
    this.#onRemove = onRemove;
    this.#onRename = onRename;
  }

  // Read a remote archive's metadata and stage it as a draft, without saving, so the user can review
  // and rename it before committing.
  async stageUrl(url: string): Promise<DraftChart> {
    const meta = await readPmtilesMeta(url);
    return {
      source: {
        id: uuidv4(),
        name: meta.name ?? nameFromUrl(url),
        kind: meta.kind,
        origin: { type: 'url', url },
        bounds: meta.bounds,
        minzoom: meta.minzoom,
        maxzoom: meta.maxzoom,
        layers: meta.vectorLayers,
      },
    };
  }

  // Save a staged draft with the reviewed name, which fires onAdd so the map flies to the new chart.
  commit(draft: DraftChart, name: string): void {
    const source: UserChartSource = { ...draft.source, name: name.trim() || draft.source.name };
    this.sources = [...this.sources, source];
    this.#persist(this.sources);
    this.#onAdd?.(source);
  }

  rename(id: string, name: string): void {
    const index = this.sources.findIndex((source) => source.id === id);
    if (index < 0) return;
    const renamed = { ...this.sources[index], name };
    this.sources = this.sources.with(index, renamed);
    this.#persist(this.sources);
    this.#onRename?.(renamed);
  }

  remove(id: string): void {
    const source = this.sources.find((s) => s.id === id);
    if (!source) return;
    this.#onRemove?.(source);
    this.sources = this.sources.filter((s) => s.id !== id);
    this.#persist(this.sources);
  }
}
