// The radius a fresh watch starts with, before the navigator captures the real swing.
export const DEFAULT_RADIUS_M = 50;
// The smallest radius the watch accepts: below this, normal GPS scatter alone trips the alarm.
export const MIN_RADIUS_M = 10;
// Slack added on top of the measured distance by the "set from current distance" capture, so the
// boat sitting at the end of its rode is not already on the alarm line.
export const CAPTURE_MARGIN_M = 15;

// The watch radius captured from the live distance to the anchor: the measured swing plus a margin,
// held to the minimum and rounded up to a whole meter so the panel shows a clean number.
export function capturedRadius(distanceMeters: number): number {
  return Math.max(MIN_RADIUS_M, Math.ceil(distanceMeters + CAPTURE_MARGIN_M));
}
