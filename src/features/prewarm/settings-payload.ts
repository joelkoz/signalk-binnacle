/** Build the /api/position-warm/config payload from the position-warm settings controls. Values are
 * SI (meters, seconds); the panel converts from the display unit through UnitField before calling
 * this function. */

import { isRecord } from '$shared/lib';

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
  if (!isRecord(cfg)) return null;
  const pw = cfg.positionWarm;
  if (!isRecord(pw)) return null;
  if (
    typeof pw.enabled !== 'boolean' ||
    typeof pw.radiusMeters !== 'number' ||
    typeof pw.moveThresholdMeters !== 'number' ||
    typeof pw.intervalSecs !== 'number' ||
    typeof pw.baseZoom !== 'number' ||
    !Array.isArray(pw.sources)
  )
    return null;
  return {
    enabled: pw.enabled,
    radiusMeters: pw.radiusMeters,
    moveThresholdMeters: pw.moveThresholdMeters,
    intervalSecs: pw.intervalSecs,
    baseZoom: pw.baseZoom,
    sources: pw.sources.filter((s): s is string => typeof s === 'string'),
  };
}
