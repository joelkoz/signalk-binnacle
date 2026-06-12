import type { Thresholds } from '$shared/settings';

// Inline caution for a configuration that silently disables or inverts the alarm bands. The
// inputs stay permissive (no blocking validation); this only surfaces what the numbers mean.
export function thresholdsCaution(t: Thresholds): string | undefined {
  if (t.dangerCpaMeters === 0 || t.dangerTcpaSeconds === 0) {
    return 'A danger threshold of 0 disables the danger alarm.';
  }
  if (t.dangerCpaMeters > t.warningCpaMeters || t.dangerTcpaSeconds > t.warningTcpaSeconds) {
    return 'Danger thresholds usually sit at or inside the warning thresholds; check these values.';
  }
  return undefined;
}
