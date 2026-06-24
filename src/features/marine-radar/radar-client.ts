import { fetchJsonOrUndefined, isRecord, withTimeout } from '$shared/lib';
import { authInit, sendJson } from '$shared/signalk';
import type {
  ControlDefinition,
  LegendEntry,
  RadarCapabilities,
  RadarControls,
  RadarInfo,
  RadarStatus,
} from './radar-types';

// The Signal K v2 radar API. The server serves a JSON array of radars here; a provider plugin (mayara)
// populates it, and a stock server with no provider returns `[]`.
const RADARS_PATH = '/signalk/v2/api/vessels/self/radars';

const RADAR_STATUSES: ReadonlySet<string> = new Set(['off', 'standby', 'transmit', 'warming']);

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && value > 0 ? Math.trunc(value) : fallback;
}

function parseControls(raw: unknown): RadarControls {
  if (!isRecord(raw)) return {};
  const out: RadarControls = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (isRecord(entry) && typeof entry.value === 'number') {
      out[id] = {
        value: entry.value,
        auto: typeof entry.auto === 'boolean' ? entry.auto : undefined,
      };
    }
  }
  return out;
}

// Validate each legend entry rather than casting the array wholesale: a malformed color would flow
// straight into the GL color table as NaN. Entries without a string color are dropped.
function parseLegend(raw: unknown): LegendEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: LegendEntry[] = [];
  for (const e of raw) {
    if (isRecord(e) && typeof e.color === 'string') {
      out.push({
        color: e.color,
        label: typeof e.label === 'string' ? e.label : '',
        minValue: typeof e.minValue === 'number' ? e.minValue : undefined,
        maxValue: typeof e.maxValue === 'number' ? e.maxValue : undefined,
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

function toRadarInfo(raw: unknown): RadarInfo | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string') return undefined;
  const id = raw.id;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    brand: typeof raw.brand === 'string' ? raw.brand : undefined,
    status: RADAR_STATUSES.has(raw.status as string) ? (raw.status as RadarStatus) : 'off',
    spokesPerRevolution: positiveInt(raw.spokesPerRevolution, 2048),
    maxSpokeLen: positiveInt(raw.maxSpokeLen, 1024),
    range: typeof raw.range === 'number' ? raw.range : 0,
    controls: parseControls(raw.controls),
    legend: parseLegend(raw.legend),
    streamUrl: typeof raw.streamUrl === 'string' ? raw.streamUrl : undefined,
  };
}

// A control's value range, only when min and max are both real numbers: the slider binds them as
// numbers, so an undefined min or max from a malformed capability must collapse the whole range to
// undefined (the slider then falls back to 0..100) rather than producing a NaN-bounded slider.
function parseRange(raw: unknown): ControlDefinition['range'] {
  if (!isRecord(raw) || typeof raw.min !== 'number' || typeof raw.max !== 'number')
    return undefined;
  return {
    min: raw.min,
    max: raw.max,
    step: typeof raw.step === 'number' ? raw.step : undefined,
    unit: typeof raw.unit === 'string' ? raw.unit : undefined,
  };
}

function parseEnumValues(raw: unknown): ControlDefinition['values'] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<ControlDefinition['values']> = [];
  for (const v of raw) {
    if (isRecord(v) && (typeof v.value === 'string' || typeof v.value === 'number')) {
      out.push({ value: v.value, label: typeof v.label === 'string' ? v.label : String(v.value) });
    }
  }
  return out.length > 0 ? out : undefined;
}

function toControlDefinition(raw: unknown): ControlDefinition | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string') return undefined;
  const type = raw.type;
  const modes = Array.isArray(raw.modes)
    ? raw.modes.filter((m): m is 'auto' | 'manual' => m === 'auto' || m === 'manual')
    : undefined;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    type: type === 'boolean' || type === 'enum' || type === 'compound' ? type : 'number',
    range: parseRange(raw.range),
    values: parseEnumValues(raw.values),
    modes: modes && modes.length > 0 ? modes : undefined,
    readOnly: raw.readOnly === true,
  };
}

// Discover the radars the Signal K server exposes. Returns the parsed array, or `[]` for a stock
// server with no provider (a 404), an auth refusal, or any transport failure: the radar layer simply
// degrades to "no radar". A non-404 error status is logged so a reachable-but-broken provider is not
// silently read as absent.
export async function discoverRadars(
  origin: string,
  token: string | undefined,
): Promise<RadarInfo[]> {
  try {
    const response = await fetch(`${origin}${RADARS_PATH}`, withTimeout(authInit(token)));
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`[marine-radar] radar discovery returned ${response.status}`);
      }
      return [];
    }
    const body = await response.json();
    if (!Array.isArray(body)) return [];
    return body.map(toRadarInfo).filter((r): r is RadarInfo => r !== undefined);
  } catch {
    return [];
  }
}

// The control definitions for a radar (ranges, types, enum values), used to render the controls UI.
export async function fetchCapabilities(
  origin: string,
  token: string | undefined,
  radarId: string,
): Promise<RadarCapabilities | undefined> {
  const url = `${origin}${RADARS_PATH}/${encodeURIComponent(radarId)}/capabilities`;
  const body = await fetchJsonOrUndefined<unknown>(url, authInit(token));
  if (!isRecord(body) || !Array.isArray(body.controls)) return undefined;
  const controls = body.controls
    .map(toControlDefinition)
    .filter((c): c is ControlDefinition => c !== undefined);
  return { controls };
}

// The radar's protobuf spoke stream URL. A provider populates streamUrl in practice; the fallback is
// the built-in per-radar stream endpoint. The radar API documents two built-in shapes, `<radar>/stream`
// and `/streams/radars/{id}`; the per-radar form is used here, so a provider that serves only the other
// form must populate streamUrl. http(s) is rewritten to ws(s) for the WebSocket connect.
export function spokesUrl(origin: string, radar: RadarInfo): string {
  const raw = radar.streamUrl ?? `${origin}${RADARS_PATH}/${encodeURIComponent(radar.id)}/stream`;
  return raw.replace(/^http/, 'ws');
}

// Set a single control. PUT /radars/{id}/controls/{controlId} with the new value. Returns the outcome
// so the caller can tell an auth refusal (401/403, a read-only token) from any other failure; logs a
// rejected write. The caller updates the displayed value optimistically.
export async function writeControl(
  origin: string,
  token: string | undefined,
  radarId: string,
  controlId: string,
  value: number,
): Promise<{ ok: boolean; status: number }> {
  const url = `${origin}${RADARS_PATH}/${encodeURIComponent(radarId)}/controls/${encodeURIComponent(controlId)}`;
  const result = await sendJson(url, token, 'PUT', { value });
  const status = result?.status ?? 0;
  if (!result?.ok) {
    console.warn(`[marine-radar] control ${controlId} write rejected: ${status || 'network'}`);
  }
  return { ok: result?.ok ?? false, status };
}
