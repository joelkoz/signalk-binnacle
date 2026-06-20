import { fetchJsonOrUndefined } from '$shared/lib';
import { authInit } from './resource';

// The server's v2 History API (signalk-server 2.19 and later): the server core mounts
// /signalk/v2/api/history and proxies to pluggable providers (signalk-questdb,
// signalk-to-influxdb2 2.x, signalk-parquet). The shape is columnar: one row per bucket,
// [timestamp, ...one value per requested path], nulls filling gaps. Stock servers have the
// routes but no provider; /values then answers 501, and _providers answers {}.
const HISTORY_API = '/signalk/v2/api/history';

export interface HistoryProviders {
  // Every registered provider id, the default first.
  ids: readonly string[];
}

export interface HistoryColumn {
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

export async function fetchHistoryProviders(
  base: string,
  token?: string,
): Promise<HistoryProviders | undefined> {
  const body = await fetchJsonOrUndefined<Record<string, { isDefault?: boolean }>>(
    `${base}${HISTORY_API}/_providers`,
    authInit(token),
  );
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const ids = Object.keys(body).sort((a, b) => {
    const aDefault = body[a]?.isDefault === true ? 0 : 1;
    const bDefault = body[b]?.isDefault === true ? 0 : 1;
    return aDefault - bDefault;
  });
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
    if (values.rows.some((row) => row.slice(1).some((cell) => cell != null))) {
      return { values, provider };
    }
    first ??= { values, provider };
  }
  return first;
}
