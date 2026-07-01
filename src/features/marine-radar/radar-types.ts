// The Signal K v2 radar API shapes Binnacle consumes, mirrored from `@signalk/server-api`'s radarapi
// types. That package is never imported in browser or worker code (its barrel pulls in Node's
// EventEmitter via FullSignalK), so the few wire types live here. The server serves these at
// `/signalk/v2/api/vessels/self/radars`; a provider plugin (mayara) populates them.

export type RadarStatus = 'off' | 'standby' | 'transmit' | 'warming';

// The pending-set key for an in-flight transmit/standby write. Shared by the controller (which marks
// it pending on setPower) and the store (which skips it in reconcile), so the optimistic-write guard
// cannot break by the two sides spelling the sentinel differently, and it cannot collide with a real
// control id.
export const POWER_PENDING_KEY = 'power';

// A live control value. `auto` is present on controls that support an automatic mode (gain, sea); a
// value-only control (rain on some radars) omits it.
interface RadarControlEntry {
  value: number;
  auto?: boolean;
}

// Current control settings keyed by control id, as reported in RadarInfo.controls.
export type RadarControls = Record<string, RadarControlEntry | undefined>;

// One color stop in a radar's display legend. `minValue`/`maxValue` bound the raw spoke sample values
// this color covers; when absent the entry index is the sample value.
export interface LegendEntry {
  color: string;
  label: string;
  minValue?: number;
  maxValue?: number;
}

// A radar as listed by GET /signalk/v2/api/vessels/self/radars (the array elements).
export interface RadarInfo {
  id: string;
  name: string;
  brand?: string;
  status: RadarStatus;
  spokesPerRevolution: number;
  maxSpokeLen: number;
  range: number;
  controls: RadarControls;
  legend?: LegendEntry[];
  // WebSocket URL for the protobuf spoke stream. When absent the built-in stream at
  // `<radar>/stream` is used.
  streamUrl?: string;
}

// A control definition from GET /radars/{id}/capabilities, used to render the controls UI. Enum values
// are numeric on the wire (the spoke control domain is integer indices), so the internal type pins
// `value` to number; both capability dialects coerce to it.
export interface ControlDefinition {
  id: string;
  name: string;
  description?: string;
  type: 'boolean' | 'number' | 'enum' | 'compound';
  range?: { min: number; max: number; step?: number; unit?: string };
  values?: Array<{ value: number; label: string }>;
  modes?: Array<'auto' | 'manual'>;
  readOnly?: boolean;
}

// The subset of GET /radars/{id}/capabilities Binnacle reads.
export interface RadarCapabilities {
  controls: ControlDefinition[];
}
