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

// The Signal K v2 radar API. The server serves a JSON ARRAY of RadarInfo objects here (each with its
// own `id`); a provider plugin (mayara) populates it, and a stock server with no provider returns `[]`.
// Note: the server's published OpenAPI doc models this as an id-keyed map, but the implementation and
// the @signalk/server-api RadarInfo type return an array, which is what is verified against here. Do
// not "correct" this to a map from the OpenAPI doc.
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

// A control's value range, only when minValue and maxValue are both real numbers: the slider binds
// them as numbers, so an undefined bound from a malformed capability must collapse the whole range to
// undefined (the slider then falls back to 0..100) rather than producing a NaN-bounded slider.
function parseRange(raw: Record<string, unknown>): ControlDefinition['range'] {
  if (typeof raw.minValue !== 'number' || typeof raw.maxValue !== 'number') return undefined;
  return {
    min: raw.minValue,
    max: raw.maxValue,
    step: typeof raw.stepValue === 'number' ? raw.stepValue : undefined,
    unit: typeof raw.units === 'string' ? raw.units : undefined,
  };
}

// Enum choices from the spec's `descriptions` map (value to label). When the control declares
// `validValues`, restrict the choices to the values the radar will accept; otherwise offer every
// described state. Enum values are numeric on the wire.
function parseEnumValues(descriptions: unknown, validValues: unknown): ControlDefinition['values'] {
  if (!isRecord(descriptions)) return undefined;
  const wanted = Array.isArray(validValues)
    ? validValues.filter((v): v is number => typeof v === 'number')
    : Object.keys(descriptions).map(Number).filter(Number.isFinite);
  const values = wanted.map((value) => {
    const label = descriptions[String(value)];
    return { value, label: typeof label === 'string' ? label : String(value) };
  });
  return values.length > 0 ? values : undefined;
}

// The control dataTypes Binnacle renders with its slider and select widgets. The radar API also
// defines string, button, sector, zone, and rect controls; each needs a dedicated widget, so they are
// skipped rather than mis-rendered as a plain slider. The everyday gain, sea, rain, range, and mode
// controls are number or enum, so the panel still shows what a helmsman reaches for.
const RENDERABLE_DATATYPES: ReadonlySet<string> = new Set(['number', 'enum']);

// The modes for a control that reports an automatic mode: it can be set to auto or driven manually.
const AUTO_MANUAL_MODES: Array<'auto' | 'manual'> = ['auto', 'manual'];

// Map one capability schema, keyed by its control id, to a control definition. The id is the object
// key (used in the control write path), not the numeric `id` field.
function toControlDefinition(id: string, raw: unknown): ControlDefinition | undefined {
  if (!isRecord(raw) || typeof raw.dataType !== 'string') return undefined;
  if (!RENDERABLE_DATATYPES.has(raw.dataType)) return undefined;
  const type = raw.dataType === 'enum' ? 'enum' : 'number';
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    type,
    range: parseRange(raw),
    values: type === 'enum' ? parseEnumValues(raw.descriptions, raw.validValues) : undefined,
    // hasAuto declares an automatic mode; the panel offers an Auto toggle beside the manual value.
    modes: raw.hasAuto === true ? AUTO_MANUAL_MODES : undefined,
    readOnly: raw.isReadOnly === true,
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
  // The radar API serves `controls` as an object keyed by control id, not an array.
  if (!isRecord(body) || !isRecord(body.controls)) return undefined;
  const controls = Object.entries(body.controls)
    .map(([id, raw]) => toControlDefinition(id, raw))
    .filter((c): c is ControlDefinition => c !== undefined);
  return { controls };
}

// Fallback control definitions built from the controls a radar reported at discovery, for a provider
// that does not serve /capabilities (fetchCapabilities then returns undefined). The real dataType and
// range are unknown, so each becomes a plain numeric slider (the slider uses its 0..100 default), with
// an Auto toggle when the reported control carried an auto flag. The panel then shows the controls the
// radar reports rather than nothing.
export function capabilitiesFromControls(radar: RadarInfo): ControlDefinition[] {
  const out: ControlDefinition[] = [];
  for (const [id, entry] of Object.entries(radar.controls)) {
    if (!entry) continue;
    out.push({
      id,
      name: id,
      type: 'number',
      modes: entry.auto !== undefined ? AUTO_MANUAL_MODES : undefined,
      readOnly: false,
    });
  }
  return out;
}

// The radar's protobuf spoke stream URL. A provider populates streamUrl in practice; the fallback is
// the built-in per-radar stream endpoint. The radar API documents two built-in shapes, `<radar>/stream`
// and `/streams/radars/{id}`; the per-radar form is used here, so a provider that serves only the other
// form must populate streamUrl. http(s) is rewritten to ws(s) for the WebSocket connect.
export function spokesUrl(origin: string, radar: RadarInfo): string {
  const raw = radar.streamUrl ?? `${origin}${RADARS_PATH}/${encodeURIComponent(radar.id)}/stream`;
  return raw.replace(/^http/, 'ws');
}

// One control write: a manual value, or an auto-mode toggle. The v2 control PUT reads `body.value`
// when present and otherwise the whole body, so a manual write sends `{ value }` (which also takes the
// control out of auto) and an auto write sends `{ auto }` with no value (sending both would let the
// server's value-first extraction drop the auto flag).
export type ControlWrite = { value: number } | { auto: boolean };

// Set a single control. PUT /radars/{id}/controls/{controlId} with the value or the auto flag. Returns
// the outcome so the caller can tell an auth refusal (401/403, a read-only token) from any other
// failure; logs a rejected write. The caller updates the displayed state optimistically.
export async function writeControl(
  origin: string,
  token: string | undefined,
  radarId: string,
  controlId: string,
  write: ControlWrite,
): Promise<{ ok: boolean; status: number }> {
  const url = `${origin}${RADARS_PATH}/${encodeURIComponent(radarId)}/controls/${encodeURIComponent(controlId)}`;
  const result = await sendJson(url, token, 'PUT', write);
  const status = result?.status ?? 0;
  if (!result?.ok) {
    console.warn(`[marine-radar] control ${controlId} write rejected: ${status || 'network'}`);
  }
  return { ok: result?.ok ?? false, status };
}
