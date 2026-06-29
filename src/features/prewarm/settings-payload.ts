/** Build the /api/prewarm/config payload from the position-warm settings controls. Values are
 * SI (meters, seconds); the panel converts from the display unit through UnitField before calling
 * this function. */

export interface PositionWarmSettings {
  enabled: boolean;
  radiusMeters: number;
  moveThresholdMeters: number;
  intervalSecs: number;
  baseZoom: number;
  sources: string[];
}

export function buildConfigPayload(settings: PositionWarmSettings): {
  positionWarm: PositionWarmSettings;
} {
  return { positionWarm: settings };
}
