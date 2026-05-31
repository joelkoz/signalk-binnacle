import type { Context, Path, Value } from '@signalk/server-api';

export type { Context, Path, Value } from '@signalk/server-api';

export type ConnectionPhase = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ConnectionState {
  phase: ConnectionPhase;
  attempt: number;
  since: number;
}

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
