export interface TimeRange {
  start: number;
  end: number;
  stepMs: number;
}

export function clampTime(t: number, r: TimeRange): number {
  return Math.min(r.end, Math.max(r.start, t));
}

export function stepTime(t: number, dir: 1 | -1, r: TimeRange): number {
  return clampTime(t + dir * r.stepMs, r);
}

// Advance during playback, wrapping back to the start once past the end so the loop repeats.
export function advancePlay(t: number, r: TimeRange): number {
  const next = t + r.stepMs;
  return next > r.end ? r.start : next;
}
