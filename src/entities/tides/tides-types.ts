// All values are SI: height in meters, velocity in m/s, time as Unix milliseconds, and position in
// decimal degrees. NOAA CO-OPS is the source, so this is US and territories only.
export interface TideStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface TideEvent {
  timeMs: number;
  heightMeters: number;
  kind: 'high' | 'low';
}

export interface CurrentEvent {
  timeMs: number;
  velocityMps: number;
  // The mean set of the stream in radians true (SI), present for flood and ebb, absent at slack.
  directionRad: number | undefined;
  kind: 'flood' | 'ebb' | 'slack';
}

export interface TideReading {
  station: TideStation;
  distanceMeters: number;
  events: TideEvent[];
}

export interface CurrentReading {
  station: TideStation;
  distanceMeters: number;
  events: CurrentEvent[];
}

export type TidesStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-coverage';

// Which source served the readings: the signalk-tides server plugin when installed, else NOAA
// CO-OPS fetched browser-side. The panel surfaces it as a quiet provenance note.
export type TidesSource = 'signalk-tides' | 'noaa-coops';
