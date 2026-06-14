import type { Waypoint } from '$entities/route';
import { isLatitude, isLongitude } from '$shared/geo';
import { isFiniteNumber } from '$shared/lib';
import { authInit } from '$shared/signalk';

export const ROUTE_DRAFT_PATH = '/plugins/signalk-crows-nest/api/route-draft';
export const ROUTE_DRAFT_PLUGIN_ID = 'signalk-crows-nest';
// The signalk-crows-nest version that first ships the route-draft endpoint.
export const ROUTE_DRAFT_PLUGIN_MIN_VERSION = '0.10.0';

export interface DraftRouteRequest {
  prompt: string;
  from: { latitude: number; longitude: number };
  bounds: [number, number, number, number];
  units: 'metric' | 'imperial';
}

export interface DraftFuel {
  neededL: number;
  aboardL?: number;
  marginPct?: number;
  derateNote?: string;
}

export interface DraftFlag {
  wp?: number;
  leg?: number;
  kind: 'land' | 'shallow' | 'hazard' | 'fuel' | 'other';
  message: string;
}

export interface DraftedRoute {
  waypoints: Waypoint[];
  name?: string;
  note: string;
  destination?: { name: string };
  confidence?: 'high' | 'low';
  fuel?: DraftFuel;
  flags?: DraftFlag[];
}

// The draft as the panel shows it: display strings the app has already formatted, plus the ordered
// flags. Undefined for a hand-drawn working route. Shared so the app and the panel agree on the shape.
export interface DraftView {
  name: string;
  destination?: string;
  note?: string;
  fuel?: string;
  flags?: readonly DraftFlag[];
}

// The single source for the error set: the type is derived from this list and the runtime guard reads
// the same list, so the two cannot drift.
const DRAFT_ERRORS = [
  'budget',
  'no-route',
  'model-error',
  'timeout',
  'unreachable',
  'unauthorized',
  'bad-request',
] as const;
export type DraftError = (typeof DRAFT_ERRORS)[number];

export type DraftResult =
  | { ok: true; route: DraftedRoute }
  | { ok: false; error: DraftError; message: string };

const KNOWN_ERRORS = new Set<DraftError>(DRAFT_ERRORS);

function isKnownError(v: unknown): v is DraftError {
  return typeof v === 'string' && KNOWN_ERRORS.has(v as DraftError);
}

function parseSemver(s: string): number[] {
  return s.split('.').map((n) => (Number.isFinite(+n) ? +n : 0));
}

function compareSemver(a: string, b: string): number {
  const [aMaj = 0, aMin = 0, aPat = 0] = parseSemver(a);
  const [bMaj = 0, bMin = 0, bPat = 0] = parseSemver(b);
  return aMaj !== bMaj ? aMaj - bMaj : aMin !== bMin ? aMin - bMin : aPat - bPat;
}

export function routeDraftAvailable(plugins: ReadonlyMap<string, string> | undefined): boolean {
  if (!plugins) return false;
  const version = plugins.get(ROUTE_DRAFT_PLUGIN_ID);
  if (!version) return false;
  return compareSemver(version, ROUTE_DRAFT_PLUGIN_MIN_VERSION) >= 0;
}

const MAX_WAYPOINTS = 60;
const DRAFT_TIMEOUT_MS = 25_000;

const FLAG_KINDS = new Set<DraftFlag['kind']>(['land', 'shallow', 'hazard', 'fuel', 'other']);

function isFlagKind(v: unknown): v is DraftFlag['kind'] {
  return typeof v === 'string' && FLAG_KINDS.has(v as DraftFlag['kind']);
}

function validateWaypoints(raw: unknown): Waypoint[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const waypoints: Waypoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return undefined;
    const obj = item as Record<string, unknown>;
    // Reject lat/lng aliases; only latitude/longitude are valid.
    if ('lat' in obj || 'lng' in obj || 'lon' in obj) return undefined;
    if (!isLatitude(obj.latitude) || !isLongitude(obj.longitude)) return undefined;
    waypoints.push({
      position: { latitude: obj.latitude, longitude: obj.longitude },
      ...(typeof obj.name === 'string' ? { name: obj.name } : {}),
    });
  }
  return waypoints;
}

// The model's JSON is untrusted: each flag is validated element by element (a null or a string would
// otherwise throw on property access and strand the caller), an unknown kind is dropped (it would make
// the display-order comparator return NaN), and an out-of-range wp or leg index is dropped.
function validateFlags(raw: unknown, wpCount: number): DraftFlag[] {
  if (!Array.isArray(raw)) return [];
  const flags: DraftFlag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (!isFlagKind(f.kind) || typeof f.message !== 'string') continue;
    if (typeof f.wp === 'number' && (f.wp < 0 || f.wp >= wpCount)) continue;
    if (typeof f.leg === 'number' && (f.leg < 0 || f.leg >= wpCount - 1)) continue;
    flags.push({
      kind: f.kind,
      message: f.message,
      ...(typeof f.wp === 'number' ? { wp: f.wp } : {}),
      ...(typeof f.leg === 'number' ? { leg: f.leg } : {}),
    });
  }
  return flags;
}

// A fuel estimate is kept only when neededL is a finite number, so the panel never renders "~NaN" to a
// navigator from a malformed or partial fuel object. The optional fields are validated by type too.
function validateFuel(raw: unknown): DraftFuel | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const f = raw as Record<string, unknown>;
  if (!isFiniteNumber(f.neededL)) return undefined;
  return {
    neededL: f.neededL,
    ...(isFiniteNumber(f.aboardL) ? { aboardL: f.aboardL } : {}),
    ...(isFiniteNumber(f.marginPct) ? { marginPct: f.marginPct } : {}),
    ...(typeof f.derateNote === 'string' ? { derateNote: f.derateNote } : {}),
  };
}

// A resolved destination is kept when it has a name, which drives the panel's "read as" line. Its
// coordinates are not carried: no consumer reads them yet, so validating and storing them would be
// dead data, and a future "go to destination" action would re-add them at its own use site.
function validateDestination(raw: unknown): DraftedRoute['destination'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const name = (raw as Record<string, unknown>).name;
  return typeof name === 'string' ? { name } : undefined;
}

export async function draftRoute(
  base: string,
  token: string | undefined,
  req: DraftRouteRequest,
  signal?: AbortSignal,
): Promise<DraftResult> {
  const signals: AbortSignal[] = [AbortSignal.timeout(DRAFT_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  const combined = AbortSignal.any(signals);

  let response: Response;
  try {
    response = await fetch(
      `${base}${ROUTE_DRAFT_PATH}`,
      authInit(token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: combined,
      }),
    );
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'TimeoutError') return { ok: false, error: 'timeout', message: err.message };
      // A deliberate cancel (a newer draft or a clear) aborts the caller signal. The caller always
      // drops this result via its sequence guard, so the outward error class here is immaterial.
      if (err.name === 'AbortError')
        return { ok: false, error: 'unreachable', message: 'cancelled' };
    }
    return { ok: false, error: 'unreachable', message: String(err) };
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'unauthorized', message: `HTTP ${response.status}` };
    }
    let errorCode: DraftError = response.status >= 500 ? 'unreachable' : 'bad-request';
    try {
      const body = (await response.json()) as { ok?: unknown; error?: unknown };
      if (body.ok === false && isKnownError(body.error)) errorCode = body.error;
    } catch {
      // Use the status-derived code.
    }
    return { ok: false, error: errorCode, message: `HTTP ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'unreachable', message: 'invalid JSON in response' };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'unreachable', message: 'unexpected response shape' };
  }

  const b = body as Record<string, unknown>;

  if (b.ok === false) {
    const errCode = isKnownError(b.error) ? b.error : 'model-error';
    return {
      ok: false,
      error: errCode,
      message: typeof b.message === 'string' ? b.message : errCode,
    };
  }

  const waypoints = validateWaypoints(b.waypoints);
  if (!waypoints) {
    return { ok: false, error: 'no-route', message: 'response waypoints failed shape validation' };
  }

  const capped = waypoints.slice(0, MAX_WAYPOINTS);
  const flags = validateFlags(b.flags, capped.length);
  const fuel = validateFuel(b.fuel);
  const destination = validateDestination(b.destination);

  const route: DraftedRoute = {
    waypoints: capped,
    note: typeof b.note === 'string' ? b.note : '',
    ...(typeof b.name === 'string' ? { name: b.name } : {}),
    ...(destination ? { destination } : {}),
    ...(b.confidence === 'high' || b.confidence === 'low' ? { confidence: b.confidence } : {}),
    ...(fuel ? { fuel } : {}),
    ...(flags.length > 0 ? { flags } : {}),
  };

  return { ok: true, route };
}
