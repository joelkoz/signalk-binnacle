import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';

let protocol: Protocol | undefined;

// Range reads are retried because the archive is uncached (cache: 'no-store', see below),
// so a chart tile depends on a live range read every time. Over a real network a transient
// drop or a server hiccup under a burst of reads (e.g. a zoom that pulls in new tiles)
// would otherwise blank that tile until a later zoom re-requests it. A caller abort is not
// retried: MapLibre aborts in-flight tiles on view change by design.
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [200, 500];

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}

// A PMTiles source that fetches ranges with `cache: 'no-store'`. A large PMTiles
// archive served with a weak ETag over range requests makes Chrome fail the HTTP
// disk-cache write (ERR_CACHE_WRITE_FAILURE), which rejects the whole fetch and blanks
// the chart. Bypassing the HTTP cache for these range reads avoids that; the offline
// service-worker cache (a later spec) is what gives these archives durable caching.
// Exported for testing the retry behavior.
export class NoStoreSource implements Source {
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
    const headers = { Range: `bytes=${offset}-${offset + length - 1}` };
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(this.#url, { signal, cache: 'no-store', headers });
      } catch (error) {
        // A network error is transient and retryable; a caller abort is not.
        if (isAbort(error, signal) || attempt >= MAX_RETRIES) throw error;
        await this.#backoff(attempt, signal);
        continue;
      }
      if (response.status < 300) {
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
      // 5xx is a transient server condition worth retrying; any other error status will not.
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await this.#backoff(attempt, signal);
        continue;
      }
      throw new Error(`PMTiles fetch failed: ${response.status} for ${this.#url}`);
    }
  }

  #backoff(attempt: number, signal?: AbortSignal): Promise<void> {
    const ms = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
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
