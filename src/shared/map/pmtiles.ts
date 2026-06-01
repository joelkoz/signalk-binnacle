import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';

let protocol: Protocol | undefined;

// A PMTiles source that fetches ranges with `cache: 'no-store'`. A large PMTiles
// archive served with a weak ETag over range requests makes Chrome fail the HTTP
// disk-cache write (ERR_CACHE_WRITE_FAILURE), which rejects the whole fetch and blanks
// the chart. Bypassing the HTTP cache for these range reads avoids that; the offline
// service-worker cache (a later spec) is what gives these archives durable caching.
class NoStoreSource implements Source {
  // The protocol keys instances by getKey(). Both of its lookup paths use the bare http
  // url: the TileJSON request strips the pmtiles:// scheme, and the tile-request regex
  // captures the url without the scheme. So the key is the bare url.
  #url: string;

  constructor(httpUrl: string) {
    this.#url = httpUrl;
  }

  getKey(): string {
    return this.#url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const response = await fetch(this.#url, {
      signal,
      cache: 'no-store',
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (response.status >= 300) {
      throw new Error(`PMTiles fetch failed: ${response.status} for ${this.#url}`);
    }
    // A weak ETag cannot validate range requests, so report none rather than one the
    // library would reject as a mismatch and retry on.
    let etag = response.headers.get('ETag') ?? undefined;
    if (etag?.startsWith('W/')) etag = undefined;
    return {
      data: await response.arrayBuffer(),
      etag,
      cacheControl: response.headers.get('Cache-Control') ?? undefined,
      expires: response.headers.get('Expires') ?? undefined,
    };
  }
}

export function registerPmtilesProtocol(): void {
  if (protocol) return;
  protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
}

// Register a PMTiles archive with the no-store source so MapLibre resolves
// `pmtiles://<httpUrl>` to it instead of the default cache-writing fetch source.
export function registerPmtilesArchive(httpUrl: string): void {
  if (!protocol) registerPmtilesProtocol();
  const source = new NoStoreSource(httpUrl);
  if (protocol?.get(source.getKey())) return;
  protocol?.add(new PMTiles(source));
}
