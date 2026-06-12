import { type Header, PMTiles, TileType } from 'pmtiles';
import { NoStoreSource } from './pmtiles';

export interface PmtilesMeta {
  name?: string;
  kind: 'vector' | 'raster';
  bounds?: [number, number, number, number]; // [west, south, east, north] WGS84 degrees
  minzoom: number;
  maxzoom: number;
  vectorLayers?: string[]; // source-layer ids, for a vector archive (from metadata vector_layers)
}

// The pmtiles header decodes its packed int32 lon/lat fields by dividing by 1e7, so the
// Header's minLon/minLat/maxLon/maxLat are already WGS84 decimal degrees (see bytesToHeader
// in the pmtiles source). They map straight onto [west, south, east, north].
function boundsFromHeader(header: Header): [number, number, number, number] | undefined {
  const { minLon, minLat, maxLon, maxLat } = header;
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return undefined;
  // A zero-area or inverted box is what the header reports when bounds were never set; omit it
  // rather than emit a degenerate rectangle a caller would treat as a real extent. This also drops
  // a legitimate antimeridian-crossing extent (minLon > maxLon), a rare case where the chart still
  // renders, just without bounds.
  if (minLon >= maxLon || minLat >= maxLat) return undefined;
  return [minLon, minLat, maxLon, maxLat];
}

function vectorLayerIds(metadata: unknown): string[] | undefined {
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const raw = (metadata as { vector_layers?: unknown }).vector_layers;
  if (!Array.isArray(raw)) return undefined;
  const ids: string[] = [];
  for (const entry of raw) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === 'string') ids.push(id);
  }
  return ids.length > 0 ? ids : undefined;
}

function nameFrom(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const name = (metadata as { name?: unknown }).name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

// Pure mapping from a decoded header and its (arbitrary JSON) metadata onto PmtilesMeta.
// Separated from the I/O so it can be tested without a binary archive fixture.
export function mapPmtilesMeta(header: Header, metadata: unknown): PmtilesMeta {
  return {
    name: nameFrom(metadata),
    // Mvt and Mlt are vector tile formats; Png, Jpeg, Webp, and Avif are raster.
    kind:
      header.tileType === TileType.Mvt || header.tileType === TileType.Mlt ? 'vector' : 'raster',
    bounds: boundsFromHeader(header),
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    vectorLayers: vectorLayerIds(metadata),
  };
}

// Read a PMTiles archive header and metadata from a remote URL, using NoStoreSource for the same
// uncached, retrying range reads the map tiles use.
export async function readPmtilesMeta(url: string): Promise<PmtilesMeta> {
  const pm = new PMTiles(new NoStoreSource(url));
  const header = await pm.getHeader();
  // Metadata is optional convenience data (name, vector_layers); a malformed or absent
  // metadata block must not sink an otherwise-readable archive.
  let metadata: unknown;
  try {
    metadata = await pm.getMetadata();
  } catch {
    metadata = undefined;
  }
  return mapPmtilesMeta(header, metadata);
}
