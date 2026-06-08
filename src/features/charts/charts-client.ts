import type { SignalKChart } from '$shared/map';
import { deleteResource, fetchKeyedResource, putResource } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/charts';
const V1 = '/signalk/v1/api/resources/charts';

export async function fetchCharts(serverBase: string, token?: string): Promise<SignalKChart[]> {
  const charts = await fetchKeyedResource<SignalKChart>(
    serverBase,
    [V2, V1],
    token,
    (_id, raw) => raw as SignalKChart,
    // A reachable server returning an error is distinct from being offline, so surface it rather
    // than treating it as "no charts".
    (url, status) => console.warn(`[charts] ${url} returned ${status}`),
  );
  return charts ?? [];
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
