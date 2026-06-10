// Elapsed time as m:ss (or h:mm:ss past an hour): a recovery is timed in seconds and minutes,
// where the shared formatDuration's whole-minute readout is too coarse.
export function formatElapsed(seconds: number): string {
  const whole = Math.floor(seconds);
  const s = (whole % 60).toString().padStart(2, '0');
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}
