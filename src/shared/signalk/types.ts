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

export interface LeafWrite {
  context: Context;
  path: Path;
  value: Value;
}

// One coalesced batch delivered from the worker to the main thread per frame.
export interface SKFrame {
  self: Record<string, Value>;
  ais?: Record<string, Record<string, Value>>;
  connection: ConnectionState;
  epoch: number;
}

// An accumulated AIS target: the latest value seen per path, plus the epoch of
// the most recent update for staleness pruning.
export interface AisTargetState {
  values: Map<string, Value>;
  lastUpdate: number;
}

export interface SignalKClientApi {
  connect(url: string, onFrame: (frame: SKFrame) => void): Promise<void>;
  subscribe(entries: SubscribeEntry[]): Promise<void>;
  unsubscribe(paths: Path[], context?: Context): Promise<void>;
  disconnect(): Promise<void>;
}
