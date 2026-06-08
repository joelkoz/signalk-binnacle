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
  // Fires only when the user imports a chart (addUrl or addFile), never for the persisted set
  // restored at startup, so the app can fly the map to a freshly imported chart.
  #onAdd?: (source: UserChartSource) => void;

  constructor(
    store: PmtilesStore,
    persisted: UserChartSource[],
    persist: (sources: UserChartSource[]) => void,
    onAdd?: (source: UserChartSource) => void,
  ) {
    this.#store = store;
    this.sources = persisted;
    this.#persist = persist;
    this.#onAdd = onAdd;
  }

  async addUrl(url: string): Promise<void> {
    const meta = await readPmtilesMeta(url);
    this.#add({
      id: uuidv4(),
      name: meta.name ?? nameFromUrl(url),
      kind: meta.kind,
      origin: { type: 'url', url },
      bounds: meta.bounds,
      minzoom: meta.minzoom,
      maxzoom: meta.maxzoom,
      layers: meta.vectorLayers,
    });
  }

  async addFile(file: File): Promise<void> {
    const meta = await readPmtilesMeta(file);
    // One id for both the descriptor and the stored blob, so a chart and its file share an identity.
    const id = uuidv4();
    await this.#store.put(id, file);
    this.#add({
      id,
      name: meta.name ?? file.name.replace(/\.pmtiles$/i, ''),
      kind: meta.kind,
      origin: { type: 'file', storeId: id },
      bounds: meta.bounds,
      minzoom: meta.minzoom,
      maxzoom: meta.maxzoom,
      layers: meta.vectorLayers,
      byteSize: meta.byteSize ?? file.size,
    });
  }

  rename(id: string, name: string): void {
    this.sources = this.sources.map((source) => (source.id === id ? { ...source, name } : source));
    this.#persist(this.sources);
  }

  async remove(id: string): Promise<void> {
    const source = this.sources.find((s) => s.id === id);
    if (!source) return;
    if (source.origin.type === 'file') await this.#store.delete(source.origin.storeId);
    this.sources = this.sources.filter((s) => s.id !== id);
    this.#persist(this.sources);
  }

  resolveBlob(storeId: string): Promise<Blob | undefined> {
    return this.#store.get(storeId);
  }

  #add(source: UserChartSource): void {
    this.sources = [...this.sources, source];
    this.#persist(this.sources);
    this.#onAdd?.(source);
  }
}
