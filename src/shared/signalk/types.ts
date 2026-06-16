// Local mirrors of the Signal K wire shapes. The @signalk/server-api package is
// server-side: its entry re-exports FullSignalK, which extends Node's EventEmitter,
// so bundling it into the browser worker crashes with "Class extends value
// undefined" once `events` is externalized. The client only needs these structural
// types, so it defines them here and never imports the package.
export type Path = string;
export type Context = string;
export type Value = unknown;

// The Signal K context for the server's own vessel, before the hello handshake
// reveals its MMSI URN. Single source of truth for the transport layer's routing.
export const SELF_CONTEXT = 'vessels.self';

// The wildcard context for every other vessel's deltas (AIS), the transport-layer sibling of
// SELF_CONTEXT; subscriptions filter self out of this stream.
export const ALL_VESSELS_CONTEXT: Context = 'vessels.*';

// The path prefix every raised notification shares. The store mirrors a cell when its path starts
// with this, and SK_PATHS.allNotifications is the wildcard subscription built from it.
export const NOTIFICATIONS_PREFIX = 'notifications.';

// Notification states that mean an alarm is actively raised. 'normal' and the advisory grades do
// not sound; shared by every consumer that grades a notifications.* cell (anchor drag, MOB).
export const ALARM_NOTIFICATION_STATES: ReadonlySet<string> = new Set(['alarm', 'emergency']);

// The full Signal K alarm-state set (server-api ALARM_STATE). 'nominal' and 'normal' are the
// quiet grades; the rest escalate alert < warn < alarm < emergency.
export type NotificationState = 'nominal' | 'normal' | 'alert' | 'warn' | 'alarm' | 'emergency';

export interface PathValue {
  path: Path;
  value: Value;
}

export interface DeltaUpdate {
  values?: PathValue[];
  [key: string]: unknown;
}

export interface Delta {
  context?: Context;
  updates?: DeltaUpdate[];
  [key: string]: unknown;
}

export type ConnectionPhase = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ConnectionState {
  phase: ConnectionPhase;
  attempt: number;
}

// The state before the socket opens, shared by the store and the worker core so the
// initial literal lives in one place.
export const INITIAL_CONNECTION_STATE: ConnectionState = { phase: 'connecting', attempt: 0 };

export type SubscribePolicy = 'instant' | 'ideal' | 'fixed';

export interface SubscribeEntry {
  path: Path;
  context?: Context;
  period?: number;
  minPeriod?: number;
  policy?: SubscribePolicy;
}

// One coalesced batch delivered from the worker to the main thread per frame. Both self and AIS are
// Maps, the shape the batcher already accumulates; Comlink structured-clones them across the worker
// boundary, so there is no per-path or per-context object to build on either side.
export interface SKFrame {
  self: Map<string, Value>;
  ais?: Map<string, Map<string, Value>>;
  connection: ConnectionState;
  epoch: number;
  // The server-assigned own-vessel context from hello (vessels.urn:...), once known, so the main
  // thread can exclude self from context-keyed REST responses (the AIS trails).
  selfContext?: string;
}

// An accumulated AIS target: the latest value seen per path, plus the epoch of
// the most recent update for staleness pruning.
export interface AisTargetState {
  values: Map<string, Value>;
  lastUpdate: number;
}

// Mirrors the Signal K v2 navigation.course shapes Binnacle reads. Units: meters, radians, m/s,
// seconds, ISO 8601, positions decimal degrees. Never import @signalk/server-api in browser code.
export interface CoursePoint {
  type?: string;
  href?: string;
  name?: string;
  position?: { latitude: number; longitude: number };
}
export interface ActiveRoute {
  href?: string;
  pointIndex?: number;
  pointTotal?: number;
  reverse?: boolean;
  name?: string;
}
export interface CourseInfo {
  arrivalCircle?: number; // meters
  activeRoute?: ActiveRoute;
  nextPoint?: CoursePoint;
  previousPoint?: CoursePoint;
  startTime?: string;
  targetArrivalTime?: string | null;
}
export interface CourseCalculations {
  calcMethod?: 'GreatCircle' | 'Rhumbline';
  crossTrackError?: number | null; // meters
  bearingTrackTrue?: number | null; // radians
  distance?: number | null; // meters to next point
  bearingTrue?: number | null; // radians to next point
  velocityMadeGood?: number | null; // m/s
  timeToGo?: number | null; // seconds
  estimatedTimeOfArrival?: string | null; // ISO 8601
}

export interface SignalKClientApi {
  connect(url: string, onFrame: (frame: SKFrame) => void): Promise<void>;
  subscribe(entries: SubscribeEntry[]): Promise<void>;
  unsubscribe(paths: Path[], context?: Context): Promise<void>;
  // Send a client delta to the server (e.g. to publish a notification). Dropped if the
  // socket is not open, with no transport-level replay; the producer resends on its next
  // changed value.
  publish(delta: Delta): Promise<void>;
  // Reconnect now, resetting the backoff. Used when the OS reports the network is back, so a long
  // outage does not wait out the full backoff delay before the next attempt.
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
}
