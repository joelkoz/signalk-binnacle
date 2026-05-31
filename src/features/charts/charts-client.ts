import type { SignalKChart } from '$shared/map';

const V2 = '/signalk/v2/api/resources/charts';
const V1 = '/signalk/v1/api/resources/charts';

async function tryFetch(url: string): Promise<SignalKChart[] | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const body = (await response.json()) as Record<string, SignalKChart>;
    return Object.values(body);
  } catch {
    return undefined;
  }
}

export async function fetchCharts(serverBase: string): Promise<SignalKChart[]> {
  const v2 = await tryFetch(`${serverBase}${V2}`);
  if (v2) return v2;
  const v1 = await tryFetch(`${serverBase}${V1}`);
  return v1 ?? [];
}
