import { isFiniteNumber } from '$shared/lib';
import type { SignalKChart } from '$shared/map';
import { deleteResource, fetchKeyedResource, putResource } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/charts';
const V1 = '/signalk/v1/api/resources/charts';

// Validate a keyed chart entry before it becomes a layer, the way notes and symbols are validated:
// an error envelope ({state, statusCode, message}) or a record missing name or type has no business
// rendering, so it falls through here. The key stands in as identifier when the entry omits one.
// bounds is validated (4 finite numbers) and dropped when malformed so a bad value never reaches fitBounds.
function chartFromEntry(id: string, raw: unknown): SignalKChart | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const chart = raw as Partial<SignalKChart>;
  if (typeof chart.name !== 'string' || typeof chart.type !== 'string') return undefined;
  const identifier = typeof chart.identifier === 'string' ? chart.identifier : id;
  const bounds = chart.bounds;
  const safeBounds =
    Array.isArray(bounds) && bounds.length === 4 && (bounds as unknown[]).every(isFiniteNumber)
      ? (bounds as SignalKChart['bounds'])
      : undefined;
  return { ...(chart as SignalKChart), identifier, bounds: safeBounds };
}

// Returns undefined when every endpoint is unreachable (so a caller can keep an existing list rather
// than blank it on a transient failure, matching fetchRoutes and fetchNotes), and [] for a reachable
// server with no charts. A reachable error status is surfaced via onError rather than swallowed.
export function fetchCharts(
  serverBase: string,
  token?: string,
): Promise<SignalKChart[] | undefined> {
  return fetchKeyedResource<SignalKChart>(
    serverBase,
    [V2, V1],
    token,
    chartFromEntry,
    (url, status) => console.warn(`[charts] ${url} returned ${status}`),
  );
}

// Register a chart as a v2 resource on the server so other Signal K clients and devices discover it.
// Used for URL-backed user charts (a file-backed chart's bytes cannot be hosted on a stock server).
// Returns whether the write succeeded; never throws, so a failed sync leaves the chart local-only.
export function putChart(
  serverBase: string,
  token: string | undefined,
  chart: SignalKChart,
): Promise<boolean> {
  return putResource(`${serverBase}${V2}/${encodeURIComponent(chart.identifier)}`, token, chart);
}

// Remove a server-registered chart resource. Best-effort: a 404 (it was never synced) is reported as
// a non-success but is harmless.
export function deleteChart(
  serverBase: string,
  token: string | undefined,
  identifier: string,
): Promise<boolean> {
  return deleteResource(`${serverBase}${V2}/${encodeURIComponent(identifier)}`, token);
}
