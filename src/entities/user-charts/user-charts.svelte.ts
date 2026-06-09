import { uuidv4 } from '$shared/lib';
import { readPmtilesMeta, type SignalKChart } from '$shared/map';
import type { PmtilesStore } from '$shared/storage';

// A chart the user imported, persisted as a descriptor: a file lives in the PMTiles store by
// storeId, a URL points at a remote archive. Both vector and raster archives are supported.
export interface UserChartSource {
  id: string;
  name: string;
  kind: 'vector' | 'raster';
  origin: { type: 'url'; url: string } | { type: 'file'; storeId: string };
  bounds?: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
  layers?: string[];
  // Stored byte size for a file-backed chart, shown in the delete confirm.
  byteSize?: number;
}

// A staged import: the resolved descriptor (not yet saved) plus, for a file import, the file to
// store on commit. Staging reads the PMTiles metadata so the user can review and rename before save.
export interface DraftChart {
  source: UserChartSource;
  file?: File;
}

// Build the SignalKChart the existing chart overlay renders, with the tile url already resolved:
// a remote .pmtiles URL, or a pmtiles://blob: URL for a stored file.
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

  #store: PmtilesStore;
  #persist: (sources: UserChartSource[]) => void;
  // Fires only when the user commits an imported chart, never for the persisted set restored at
  // startup, so the app can fly the map to a freshly imported chart and sync a URL chart to the
  // server.
  #onAdd?: (source: UserChartSource) => void;
  // Fires when a chart is removed, so the app can also delete its server-registered resource. Runs
  // before the local descriptor is dropped, so the source is still available to the handler.
  #onRemove?: (source: UserChartSource) => void;

  constructor(
    store: PmtilesStore,
    persisted: UserChartSource[],
    persist: (sources: UserChartSource[]) => void,
    onAdd?: (source: UserChartSource) => void,
    onRemove?: (source: UserChartSource) => void,
  ) {
    this.#store = store;
    this.sources = persisted;
    this.#persist = persist;
    this.#onAdd = onAdd;
    this.#onRemove = onRemove;
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

  // Read a file's metadata and stage it as a draft, holding the file to store on commit. The id is
  // shared by the descriptor and the stored blob so a chart and its file keep one identity.
  async stageFile(file: File): Promise<DraftChart> {
    const meta = await readPmtilesMeta(file);
    const id = uuidv4();
    return {
      source: {
        id,
        name: meta.name ?? file.name.replace(/\.pmtiles$/i, ''),
        kind: meta.kind,
        origin: { type: 'file', storeId: id },
        bounds: meta.bounds,
        minzoom: meta.minzoom,
        maxzoom: meta.maxzoom,
        layers: meta.vectorLayers,
        byteSize: meta.byteSize ?? file.size,
      },
      file,
    };
  }

  // Save a staged draft with the reviewed name. Stores the blob for a file import, then adds the
  // descriptor (which fires onAdd so the map flies to the new chart).
  async commit(draft: DraftChart, name: string): Promise<void> {
    const source: UserChartSource = { ...draft.source, name: name.trim() || draft.source.name };
    if (draft.file && source.origin.type === 'file') {
      await this.#store.put(source.origin.storeId, draft.file);
    }
    this.#add(source);
  }

  rename(id: string, name: string): void {
    this.sources = this.sources.map((source) => (source.id === id ? { ...source, name } : source));
    this.#persist(this.sources);
  }

  async remove(id: string): Promise<void> {
    const source = this.sources.find((s) => s.id === id);
    if (!source) return;
    this.#onRemove?.(source);
    if (source.origin.type === 'file') await this.#store.delete(source.origin.storeId);
    this.sources = this.sources.filter((s) => s.id !== id);
    this.#persist(this.sources);
  }

  resolveBlob(storeId: string): Promise<Blob | undefined> {
    return this.#store.get(storeId);
  }

  // Delete any stored blob with no file-origin descriptor referencing it. Two rare paths can orphan
  // a blob: a commit whose descriptor persist failed (storage full or private mode), and a delete
  // that landed only in the degrade-to-memory fallback while IndexedDB was down. The caller runs
  // this once at startup, and only when the descriptor set was actually loaded from storage, so a
  // missing or unreadable set can never delete a valid chart's blob.
  async reconcile(): Promise<void> {
    const referenced = new Set<string>();
    for (const source of this.sources) {
      if (source.origin.type === 'file') referenced.add(source.origin.storeId);
    }
    const stored = await this.#store.keys();
    for (const id of stored) {
      if (!referenced.has(id)) await this.#store.delete(id);
    }
  }

  #add(source: UserChartSource): void {
    this.sources = [...this.sources, source];
    this.#persist(this.sources);
    this.#onAdd?.(source);
  }
}
