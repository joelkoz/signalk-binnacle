import type { SignalKChart } from '$shared/map';

const V2 = '/signalk/v2/api/resources/charts';
const V1 = '/signalk/v1/api/resources/charts';

async function tryFetch(url: string, token?: string): Promise<SignalKChart[] | undefined> {
  try {
    const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
    const response = await fetch(url, init);
    if (!response.ok) {
      // A reachable server returning an error is distinct from being offline, so
      // surface it rather than treating it as "no charts".
      console.warn(`[charts] ${url} returned ${response.status}`);
      return undefined;
    }
    const body = await response.json();
    // The resources API returns a keyed object; guard against an error envelope or array
    // arriving with a 200 so a malformed shape does not flow on as bogus charts.
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    return Object.values(body as Record<string, SignalKChart>);
  } catch {
    return undefined;
  }
}

export async function fetchCharts(serverBase: string, token?: string): Promise<SignalKChart[]> {
  const v2 = await tryFetch(`${serverBase}${V2}`, token);
  if (v2) return v2;
  const v1 = await tryFetch(`${serverBase}${V1}`, token);
  return v1 ?? [];
}
