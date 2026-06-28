/** The webapp client for the companion prewarm and config routes. The panel never calls the container
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
  perSourceAvgBytes: Record<string, number>;
}

export interface PrewarmRequestBody {
  bbox: [number, number, number, number];
  sources: string[];
  minzoom: number;
  maxzoom: number;
}

export interface PrewarmClient {
  postPrewarm(body: PrewarmRequestBody): Promise<{ jobId: string }>;
  getStatus(jobId: string): Promise<WarmStatus | null>;
  cancel(jobId: string): Promise<void>;
  getConfig(): Promise<unknown>;
  postConfig(config: unknown): Promise<void>;
  getCacheStats(): Promise<CacheStats>;
}

export function createPrewarmClient(
  origin: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): PrewarmClient {
  const url = (path: string): string => companionApiUrl(origin, path);
  const json = async <T>(r: Response): Promise<T> => (await r.json()) as T;
  const jsonPost = (body: unknown): RequestInit | undefined =>
    authInit(token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    async postPrewarm(body) {
      const r = await fetchImpl(url('/prewarm'), jsonPost(body));
      return json<{ jobId: string }>(r);
    },
    async getStatus(jobId) {
      const r = await fetchImpl(
        url(`/prewarm/status/${encodeURIComponent(jobId)}`),
        authInit(token),
      );
      if (r.status === 404) return null;
      return json<WarmStatus>(r);
    },
    async cancel(jobId) {
      await fetchImpl(
        url(`/prewarm/cancel/${encodeURIComponent(jobId)}`),
        authInit(token, { method: 'POST' }),
      );
    },
    async getConfig() {
      return json(await fetchImpl(url('/prewarm/config'), authInit(token)));
    },
    async postConfig(config) {
      await fetchImpl(url('/prewarm/config'), jsonPost(config));
    },
    async getCacheStats() {
      return json<CacheStats>(await fetchImpl(url('/cache/stats'), authInit(token)));
    },
  };
}
