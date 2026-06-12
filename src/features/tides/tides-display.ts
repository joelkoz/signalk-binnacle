import type { CurrentEvent, TideEvent } from '$entities/tides';
import { formatKnots, landDistanceUnit, metersToFeet, type UnitsMode } from '$shared/lib';

// The display edge: SI in, formatted strings out. Tide heights are shown in both meters and feet,
// with the preferred unit first, current rates in knots, the conventional units a mariner reads.
const METERS_PER_MILE = 1609.344;

function heightMeters(meters: number): string {
  return `${meters.toFixed(2)} m`;
}

function heightFeet(meters: number): string {
  return `${(metersToFeet(meters) ?? 0).toFixed(1)} ft`;
}

export function formatTideHeight(meters: number, mode: UnitsMode): string {
  return mode === 'imperial' ? heightFeet(meters) : heightMeters(meters);
}

// The other unit, shown in parentheses beside the primary height.
export function formatTideHeightSecondary(meters: number, mode: UnitsMode): string {
  return mode === 'imperial' ? heightMeters(meters) : heightFeet(meters);
}

export function formatCurrentRate(mps: number): string {
  return `${formatKnots(mps)} kn`;
}

// The distance to the nearest station for the proximity readout: whole kilometers or statute
// miles, with a "<1" floor.
export function formatStationDistance(meters: number, mode: UnitsMode): string {
  const value = mode === 'imperial' ? meters / METERS_PER_MILE : meters / 1000;
  const unit = landDistanceUnit(mode);
  return value < 1 ? `<1 ${unit}` : `${Math.round(value)} ${unit}`;
}

// The high and low events at or after a reference time, soonest first, for the next-tide readout.
export function upcomingEvents(events: TideEvent[], nowMs: number): TideEvent[] {
  return events.filter((event) => event.timeMs >= nowMs).sort((a, b) => a.timeMs - b.timeMs);
}

// The next flood or ebb at or after a reference time (slack is skipped), for the current readout.
export function nextCurrentEvent(events: CurrentEvent[], nowMs: number): CurrentEvent | undefined {
  return events
    .filter((event) => event.timeMs >= nowMs && event.kind !== 'slack')
    .sort((a, b) => a.timeMs - b.timeMs)[0];
}

// Normalize the day's high and low turning points to a 0..1 box for an SVG tide curve: x over the
// span of events, y from the lowest tide (0) to the highest (1).
export function tideCurvePoints(events: TideEvent[]): Array<{ x: number; y: number }> {
  if (events.length === 0) return [];
  const times = events.map((e) => e.timeMs);
  const heights = events.map((e) => e.heightMeters);
  const t0 = Math.min(...times);
  const h0 = Math.min(...heights);
  const tSpan = Math.max(...times) - t0 || 1;
  const hSpan = Math.max(...heights) - h0 || 1;
  return events.map((e) => ({ x: (e.timeMs - t0) / tSpan, y: (e.heightMeters - h0) / hSpan }));
}

// Where "now" falls along the tide curve's x axis, or undefined when it is outside the event span.
export function nowFraction(events: TideEvent[], nowMs: number): number | undefined {
  if (events.length === 0) return undefined;
  const times = events.map((e) => e.timeMs);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  if (nowMs < t0 || nowMs > t1) return undefined;
  return (nowMs - t0) / (t1 - t0 || 1);
}
