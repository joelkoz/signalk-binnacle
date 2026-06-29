/** The webapp client for the companion regions and config routes. The panel never calls the container
 * directly; it always goes through the admin-gated plugin routes, so the container port stays private.
 * Auth follows the webapp scheme: a bearer token through the shared authInit, the origin as the base,
 * and the client owning the path. */

import { companionApiUrl } from '$shared/companion/companion-api';
import { authInit } from '$shared/signalk';

export interface WarmStatus {
  total: number;
  done: number;
  skipped: number;
  bytes: number;
  errors: number;
  state: 'running' | 'done' | 'cancelled' | 'capped' | 'error';
}

export interface CacheStats {
  rows: number;
  bytes: number;
  cap: number;
  // The two-budget accounting fields, optional for backward compatibility with older containers.
  pinnedBytes?: number;
  scrollBytes?: number;
  regionsBudgetBytes?: number;
  positionWarmBudgetBytes?: number;
  positionWarmBytes?: number;
  regionsFreeBytes?: number;
  perSourceAvgBytes: Record<string, number>;
  // The per-source scroll totals and the current TTL days, optional for backward compatibility.
  bySource?: { source: string; bytes: number; rows: number }[];
  ttlDays?: number;
}

export interface SavedRegionDto {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  sourceIds: string[];
  minzoom: number;
  maxzoom: number;
  createdAt: number;
  lastDownloadedAt: number | null;
  bytes: number;
  status: 'downloading' | 'ready' | 'capped' | 'error' | 'needs-redownload';
  // Cache-derived from the container: SELECT SUM(bytes) WHERE region_id = ?.
  cachedBytes: number;
}

export interface RegionRequest {
  bbox: [number, number, number, number];
  sourceIds: string[];
  minzoom: number;
  maxzoom: number;
  name: string;
}

export interface RegionsClient {
  getConfig(): Promise<unknown>;
  postConfig(config: unknown): Promise<void>;
  setCacheConfig(ttlDays: number): Promise<void>;
  clearScrollCache(): Promise<{ freedBytes: number; freedRows: number }>;
  getCacheStats(): Promise<CacheStats>;
  getRegions(): Promise<SavedRegionDto[]>;
  postRegion(body: RegionRequest): Promise<{ region: SavedRegionDto; jobId: string }>;
  deleteRegion(id: string): Promise<void>;
  redownloadRegion(id: string): Promise<{ jobId: string }>;
  getRegionJobStatus(id: string): Promise<WarmStatus | null>;
  geocode(lat: number, lon: number): Promise<string | null>;
}

export function createRegionsClient(
  origin: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): RegionsClient {
  const url = (path: string): string => companionApiUrl(origin, path);
  const json = async <T>(r: Response): Promise<T> => (await r.json()) as T;
  const jsonPost = (body: unknown): RequestInit | undefined =>
    authInit(token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    async getConfig() {
      return json(await fetchImpl(url('/position-warm/config'), authInit(token)));
    },
    async postConfig(config) {
      await fetchImpl(url('/position-warm/config'), jsonPost(config));
    },
    async setCacheConfig(ttlDays) {
      await fetchImpl(url('/cache/config'), jsonPost({ ttlDays }));
    },
    async clearScrollCache() {
      return json<{ freedBytes: number; freedRows: number }>(
        await fetchImpl(url('/cache/clear-scroll'), authInit(token, { method: 'POST' })),
      );
    },
    async getCacheStats() {
      return json<CacheStats>(await fetchImpl(url('/cache/stats'), authInit(token)));
    },
    async getRegions() {
      return json<SavedRegionDto[]>(await fetchImpl(url('/regions'), authInit(token)));
    },
    async postRegion(body) {
      return json<{ region: SavedRegionDto; jobId: string }>(
        await fetchImpl(url('/regions'), jsonPost(body)),
      );
    },
    async deleteRegion(id) {
      await fetchImpl(
        url(`/regions/${encodeURIComponent(id)}`),
        authInit(token, { method: 'DELETE' }),
      );
    },
    async redownloadRegion(id) {
      return json<{ jobId: string }>(
        await fetchImpl(
          url(`/regions/${encodeURIComponent(id)}/redownload`),
          authInit(token, { method: 'POST' }),
        ),
      );
    },
    async getRegionJobStatus(id) {
      const r = await fetchImpl(url(`/regions/${encodeURIComponent(id)}/status`), authInit(token));
      // A 404 means the job is gone (the region reconciled server-side): treat it as terminal, not a
      // failure. Any other non-ok is a real failure, so throw rather than parse an error body as a
      // status snapshot, letting the poller count it and stop after a small cap.
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`region status ${r.status}`);
      return json<WarmStatus>(r);
    },
    async geocode(lat, lon) {
      try {
        const r = await fetchImpl(
          url(`/geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),
          authInit(token),
        );
        if (!r.ok) return null;
        const data = (await r.json()) as Record<string, unknown>;
        return typeof data.display_name === 'string' ? data.display_name : null;
      } catch {
        return null;
      }
    },
  };
}
