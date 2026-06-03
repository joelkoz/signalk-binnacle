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
    bounds: source.bounds,
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    layers: source.layers,
  };
}

let counter = 0;
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID needs a secure context; on plain http fall back to a unique-enough id.
  counter += 1;
  return `uc-${Date.now().toString(36)}-${counter}`;
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

  constructor(
    store: PmtilesStore,
    persisted: UserChartSource[],
    persist: (sources: UserChartSource[]) => void,
  ) {
    this.#store = store;
    this.sources = persisted;
    this.#persist = persist;
  }

  async addUrl(url: string): Promise<void> {
    const meta = await readPmtilesMeta(url);
    this.#add({
      id: newId(),
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
    const id = newId();
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
  }
}
