import { asKeyedObject, authInit, sendJson } from '$shared/signalk';
import type { ControlDefinition, RadarInfo, RadarLegend, RadarProvider } from './radar-types';

const MAYARA_PATH = '/signalk/v2/api/vessels/self/radars';
const WDANTUMA_PATH = '/plugins/radar-sk/v1/api/radars';

export interface DiscoveredRadars {
  provider: RadarProvider;
  radars: RadarInfo[];
}

function toRadarInfo(id: string, raw: unknown): RadarInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const legend = (r.legend as RadarLegend | undefined) ?? { pixels: [] };
  return {
    id: typeof r.id === 'string' ? r.id : id,
    name: typeof r.name === 'string' ? r.name : id,
    spokes: typeof r.spokes === 'number' ? r.spokes : 2048,
    maxSpokeLen: typeof r.maxSpokeLen === 'number' ? r.maxSpokeLen : 1024,
    spokeDataUrl: typeof r.spokeDataUrl === 'string' ? r.spokeDataUrl : undefined,
    streamUrl: typeof r.streamUrl === 'string' ? r.streamUrl : undefined,
    legend,
    controls: Array.isArray(r.controls) ? (r.controls as ControlDefinition[]) : undefined,
  };
}

async function fetchRadars(
  url: string,
  token: string | undefined,
): Promise<RadarInfo[] | undefined> {
  try {
    const response = await fetch(url, authInit(token));
    if (!response.ok) return undefined;
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    const radars: RadarInfo[] = [];
    for (const [id, raw] of Object.entries(keyed)) {
      const info = toRadarInfo(id, raw);
      if (info) radars.push(info);
    }
    return radars;
  } catch {
    return undefined;
  }
}

export async function discoverRadars(
  origin: string,
  token: string | undefined,
): Promise<DiscoveredRadars | undefined> {
  const mayara = await fetchRadars(`${origin}${MAYARA_PATH}`, token);
  if (mayara && mayara.length > 0) return { provider: 'mayara', radars: mayara };
  const wdantuma = await fetchRadars(`${origin}${WDANTUMA_PATH}`, token);
  if (wdantuma && wdantuma.length > 0) return { provider: 'wdantuma', radars: wdantuma };
  return undefined;
}

export function spokesUrl(origin: string, _provider: RadarProvider, radar: RadarInfo): string {
  const raw = radar.spokeDataUrl ?? radar.streamUrl ?? `${origin}${MAYARA_PATH}/${radar.id}/spokes`;
  return raw.replace(/^http/, 'ws');
}

export async function writeControl(
  origin: string,
  token: string | undefined,
  radarId: string,
  controlId: string,
  value: number,
  units: string | undefined,
): Promise<boolean> {
  const base = `${origin}${MAYARA_PATH}/${radarId}/controls`;
  const body = units !== undefined ? { value, units } : { value };
  const single = await sendJson(`${base}/${controlId}`, token, 'PUT', body);
  if (single?.ok) return true;
  if (single && single.status !== 404) return false;
  // Freeboard-SK uses a doubled-id control path; try it when the single-id form 404s.
  return (await sendJson(`${base}/${radarId}/${controlId}`, token, 'PUT', body))?.ok ?? false;
}
