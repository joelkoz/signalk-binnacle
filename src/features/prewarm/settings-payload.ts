/** Build the /api/position-warm/config payload from the position-warm settings controls. Values are
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

// Extract and validate the positionWarm section of the plugin config response. Returns null when
// the config is absent, malformed, or missing required fields, so the panel keeps its defaults.
export function extractPositionWarm(cfg: unknown): PositionWarmSettings | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const pw = (cfg as Record<string, unknown>).positionWarm;
  if (!pw || typeof pw !== 'object') return null;
  const p = pw as Record<string, unknown>;
  if (
    typeof p.enabled !== 'boolean' ||
    typeof p.radiusMeters !== 'number' ||
    typeof p.moveThresholdMeters !== 'number' ||
    typeof p.intervalSecs !== 'number' ||
    typeof p.baseZoom !== 'number' ||
    !Array.isArray(p.sources)
  )
    return null;
  return {
    enabled: p.enabled,
    radiusMeters: p.radiusMeters,
    moveThresholdMeters: p.moveThresholdMeters,
    intervalSecs: p.intervalSecs,
    baseZoom: p.baseZoom,
    sources: p.sources.filter((s): s is string => typeof s === 'string'),
  };
}
