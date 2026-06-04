import type { SignalKChart } from '$shared/map';
import { asKeyedObject, authInit } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/charts';
const V1 = '/signalk/v1/api/resources/charts';

async function tryFetch(url: string, token?: string): Promise<SignalKChart[] | undefined> {
  try {
    const response = await fetch(url, authInit(token));
    if (!response.ok) {
      // A reachable server returning an error is distinct from being offline, so
      // surface it rather than treating it as "no charts".
      console.warn(`[charts] ${url} returned ${response.status}`);
      return undefined;
    }
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    return Object.values(keyed as Record<string, SignalKChart>);
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
