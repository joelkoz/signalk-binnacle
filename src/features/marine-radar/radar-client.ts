import { isRecord } from '$shared/lib';
import { fetchKeyedResource, sendJson } from '$shared/signalk';
import type { ControlDefinition, RadarInfo, RadarLegend, RadarProvider } from './radar-types';

const MAYARA_PATH = '/signalk/v2/api/vessels/self/radars';
const WDANTUMA_PATH = '/plugins/radar-sk/v1/api/radars';

export interface DiscoveredRadars {
  provider: RadarProvider;
  radars: RadarInfo[];
}

function toRadarInfo(id: string, raw: unknown): RadarInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const legend = (raw.legend as RadarLegend | undefined) ?? { pixels: [] };
  return {
    id: typeof raw.id === 'string' ? raw.id : id,
    name: typeof raw.name === 'string' ? raw.name : id,
    spokes: typeof raw.spokes === 'number' && raw.spokes > 0 ? raw.spokes : 2048,
    maxSpokeLen:
      typeof raw.maxSpokeLen === 'number' && raw.maxSpokeLen > 0 ? raw.maxSpokeLen : 1024,
    spokeDataUrl: typeof raw.spokeDataUrl === 'string' ? raw.spokeDataUrl : undefined,
    streamUrl: typeof raw.streamUrl === 'string' ? raw.streamUrl : undefined,
    legend,
    controls: Array.isArray(raw.controls) ? (raw.controls as ControlDefinition[]) : undefined,
  };
}

function onDiscoveryError(url: string, status: number): void {
  // A 404 is the normal stock-server absence; a reachable-but-broken provider (auth refused, a 500) is
  // worth a line so it is not silently read as "no radar".
  if (status !== 404) console.warn(`[marine-radar] radar discovery at ${url} returned ${status}`);
}

export async function discoverRadars(
  origin: string,
  token: string | undefined,
): Promise<DiscoveredRadars | undefined> {
  const mayara = await fetchKeyedResource(
    origin,
    [MAYARA_PATH],
    token,
    toRadarInfo,
    onDiscoveryError,
  );
  if (mayara && mayara.length > 0) return { provider: 'mayara', radars: mayara };
  if (mayara && mayara.length === 0) {
    console.info('[marine-radar] mayara provider present but no radars listed');
  }
  const wdantuma = await fetchKeyedResource(
    origin,
    [WDANTUMA_PATH],
    token,
    toRadarInfo,
    onDiscoveryError,
  );
  if (wdantuma && wdantuma.length > 0) return { provider: 'wdantuma', radars: wdantuma };
  return undefined;
}

export function spokesUrl(origin: string, provider: RadarProvider, radar: RadarInfo): string {
  // The provider populates spokeDataUrl or streamUrl in practice; the constructed fallback is the
  // mayara v2 path, so it is used only for mayara (a wdantuma stream lives on a separate origin we
  // cannot synthesize).
  const fallback = provider === 'mayara' ? `${origin}${MAYARA_PATH}/${radar.id}/spokes` : '';
  const raw = radar.spokeDataUrl ?? radar.streamUrl ?? fallback;
  return raw.replace(/^http/, 'ws');
}

export async function writeControl(
  origin: string,
  token: string | undefined,
  provider: RadarProvider,
  radarId: string,
  controlId: string,
  value: number,
  units: string | undefined,
): Promise<boolean> {
  if (provider !== 'mayara') {
    // wdantuma writes controls over the bidirectional stream WebSocket, not REST; that path is a v1
    // follow-up, so a wdantuma control write is optimistic-only.
    console.warn(
      `[marine-radar] control write over the wdantuma stream is not wired in v1: ${controlId}`,
    );
    return false;
  }
  const base = `${origin}${MAYARA_PATH}/${radarId}/controls`;
  const body = units !== undefined ? { value, units } : { value };
  const single = await sendJson(`${base}/${controlId}`, token, 'PUT', body);
  if (single?.ok) return true;
  if (single && single.status !== 404) {
    console.warn(`[marine-radar] control ${controlId} write rejected: ${single.status}`);
    return false;
  }
  // Freeboard-SK uses a doubled-id control path; try it when the single-id form 404s.
  const doubled = await sendJson(`${base}/${radarId}/${controlId}`, token, 'PUT', body);
  if (!doubled?.ok) {
    console.warn(
      `[marine-radar] control ${controlId} write failed (single-id 404, doubled-id ${doubled?.status ?? 'network'})`,
    );
  }
  return doubled?.ok ?? false;
}
