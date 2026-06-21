import type { Waypoint } from '$entities/route';
import { isLatitude, isLongitude } from '$shared/geo';
import { isFiniteNumber } from '$shared/lib';
import type { DraftError, DraftedRoute, DraftFlag, DraftFuel } from './route-draft-client';

export const ROUTE_DRAFT_PLUGIN_ID = 'signalk-crows-nest';
// The signalk-crows-nest version that first ships the route-draft endpoint.
export const ROUTE_DRAFT_PLUGIN_MIN_VERSION = '0.10.0';

// The single source for the error set: the type is derived from this list and the runtime guard reads
// the same list, so the two cannot drift.
export const DRAFT_ERRORS = [
  'budget',
  'no-route',
  'model-error',
  'timeout',
  'unreachable',
  'unauthorized',
  'bad-request',
  'cancelled',
] as const;

const KNOWN_ERRORS = new Set<string>(DRAFT_ERRORS);

export function isKnownError(v: unknown): v is DraftError {
  return typeof v === 'string' && KNOWN_ERRORS.has(v);
}

function parseSemver(s: string): number[] {
  // Strip a leading v and parse the leading integer of each dotted segment, so a v-prefixed or
  // suffixed version (v1.2.0, 1.2.0-rc.1) reads its numbers rather than 0. A prerelease of the floor
  // version compares equal to the release, which is acceptable for an author-controlled companion.
  return s
    .replace(/^v/i, '')
    .split('.')
    .map((n) => {
      const parsed = Number.parseInt(n, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function compareSemver(a: string, b: string): number {
  const [aMaj = 0, aMin = 0, aPat = 0] = parseSemver(a);
  const [bMaj = 0, bMin = 0, bPat = 0] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

export function routeDraftAvailable(plugins: ReadonlyMap<string, string> | undefined): boolean {
  if (!plugins) return false;
  const version = plugins.get(ROUTE_DRAFT_PLUGIN_ID);
  if (!version) return false;
  return compareSemver(version, ROUTE_DRAFT_PLUGIN_MIN_VERSION) >= 0;
}

export const MAX_WAYPOINTS = 60;

const FLAG_KINDS = new Set<string>(['land', 'shallow', 'hazard', 'fuel', 'other']);

function isFlagKind(v: unknown): v is DraftFlag['kind'] {
  return typeof v === 'string' && FLAG_KINDS.has(v);
}

export function validateWaypoints(raw: unknown): Waypoint[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const waypoints: Waypoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return undefined;
    const obj = item as Record<string, unknown>;
    // Reject lat/lng aliases; only latitude/longitude are valid.
    if ('lat' in obj || 'lng' in obj || 'lon' in obj) return undefined;
    // A single invalid waypoint fails the entire set: a partial route with unknown gaps is worse than no route.
    if (!isLatitude(obj.latitude) || !isLongitude(obj.longitude)) return undefined;
    waypoints.push({
      position: { latitude: obj.latitude, longitude: obj.longitude },
      ...(typeof obj.name === 'string' ? { name: obj.name } : {}),
    });
  }
  return waypoints;
}

// The model's JSON is untrusted: each flag is validated element by element, an unknown kind is dropped
// (it would make the display-order comparator return NaN), and an out-of-range wp or leg index is dropped.
export function validateFlags(raw: unknown, wpCount: number): DraftFlag[] {
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
export function validateFuel(raw: unknown): DraftFuel | undefined {
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
export function validateDestination(raw: unknown): DraftedRoute['destination'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const name = (raw as Record<string, unknown>).name;
  return typeof name === 'string' ? { name } : undefined;
}
