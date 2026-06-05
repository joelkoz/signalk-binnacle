import type { SignalKChart } from '$shared/map';
import { fetchKeyedResource } from '$shared/signalk';

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
