import { fetchJsonOrUndefined, isRecord } from '$shared/lib';
import { asKeyedObject, authInit } from './resource';

// The server's v2 History API (signalk-server 2.19 and later): the server core mounts
// /signalk/v2/api/history and proxies to pluggable providers (signalk-questdb,
// signalk-to-influxdb2 2.x, signalk-parquet). The shape is columnar: one row per bucket,
// [timestamp, ...one value per requested path], nulls filling gaps. Stock servers have the
// routes but no provider; /values then answers 501, and _providers answers {}.
const HISTORY_API = '/signalk/v2/api/history';

// The default review window and bucket resolution, shared by the history-track overlay and the
// time-travel scrub so their geometry lines up. 24 hours at 60 seconds is about 1440 buckets.
export const HISTORY_WINDOW_SECONDS = 24 * 60 * 60;
export const HISTORY_RESOLUTION_SECONDS = 60;

export interface HistoryProviders {
  // Every registered provider id, the default first.
  ids: readonly string[];
}

interface HistoryColumn {
  path: string;
  method: string;
}

export interface HistoryValues {
  from: string;
  to: string;
  columns: readonly HistoryColumn[];
  rows: ReadonlyArray<readonly [string, ...unknown[]]>;
}

export interface HistoryQuery {
  // path or path:aggregate entries (average, min, max, first, last).
  paths: readonly string[];
  durationSeconds: number;
  resolutionSeconds?: number;
  provider?: string;
}

// The column index for a path, method-aware. When a method is given, prefer the exact
// path-plus-method column (duplicate paths with different aggregates are legal in one query), then
// fall back to the first column matching the path alone for a provider that omits the method echo.
// Returns -1 when nothing matches. Shared by the trends, time-travel, and history-track readers so the
// column lookup lives in one place.
export function columnIndex(values: HistoryValues, path: string, method?: string): number {
  if (method !== undefined) {
    const exact = values.columns.findIndex((c) => c.path === path && c.method === method);
    if (exact >= 0) return exact;
  }
  return values.columns.findIndex((c) => c.path === path);
}

export async function fetchHistoryProviders(
  base: string,
  token?: string,
): Promise<HistoryProviders | undefined> {
  const body = await fetchJsonOrUndefined(`${base}${HISTORY_API}/_providers`, authInit(token));
  const keyed = asKeyedObject(body);
  if (!keyed) return undefined;
  const isDefault = (id: string): boolean => {
    const entry = keyed[id];
    return isRecord(entry) && entry.isDefault === true;
  };
  const ids = Object.keys(keyed).sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)));
  return { ids };
}

export async function fetchHistoryValues(
  base: string,
  token: string | undefined,
  query: HistoryQuery,
): Promise<HistoryValues | undefined> {
  const params = new URLSearchParams({
    paths: query.paths.join(','),
    duration: String(query.durationSeconds),
  });
  if (query.resolutionSeconds !== undefined) {
    params.set('resolution', String(query.resolutionSeconds));
  }
  if (query.provider) params.set('provider', query.provider);
  const body = await fetchJsonOrUndefined<{
    range?: { from?: unknown; to?: unknown };
    values?: unknown;
    data?: unknown;
  }>(`${base}${HISTORY_API}/values?${params}`, authInit(token));
  // A non-ok or malformed body is undefined (unreachable); a 2xx with columns but missing or empty
  // data is a real empty result (provider present, no samples in the window), kept distinct so the
  // panel can say "no data" rather than treating it as a transport failure.
  if (!body || !Array.isArray(body.values)) return undefined;
  const columns: HistoryColumn[] = [];
  for (const col of body.values) {
    const { path, method } = (col ?? {}) as { path?: unknown; method?: unknown };
    if (typeof path !== 'string') return undefined;
    columns.push({ path, method: typeof method === 'string' ? method : '' });
  }
  const data = Array.isArray(body.data) ? body.data : [];
  const rows = data.filter(
    (row): row is [string, ...unknown[]] =>
      Array.isArray(row) && typeof row[0] === 'string' && row.length === columns.length + 1,
  );
  return {
    from: typeof body.range?.from === 'string' ? body.range.from : '',
    to: typeof body.range?.to === 'string' ? body.range.to : '',
    columns,
    rows,
  };
}

// One query that survives a default provider with no data: providers register independently
// (KIP registers its own beside signalk-questdb, and it can be the empty default), so when the
// default answers with zero rows, each remaining provider is asked once. Returns the response
// plus the provider that actually answered with rows, so a caller can pin later queries to it.
export async function fetchHistoryValuesAcrossProviders(
  base: string,
  token: string | undefined,
  providers: HistoryProviders,
  query: Omit<HistoryQuery, 'provider'>,
): Promise<{ values: HistoryValues; provider: string | undefined } | undefined> {
  let first: { values: HistoryValues; provider: string | undefined } | undefined;
  for (const provider of providers.ids.length > 0 ? providers.ids : [undefined]) {
    const values = await fetchHistoryValues(base, token, { ...query, provider });
    if (!values) continue;
    if (values.rows.some((row) => row.some((cell, i) => i > 0 && cell != null))) {
      return { values, provider };
    }
    first ??= { values, provider };
  }
  return first;
}
