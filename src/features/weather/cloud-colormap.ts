import type { Theme } from '$shared/ui';
import { type Rgba, sampleRamp } from './color-ramp';

// Cloud-cover stops as a 0..1 fraction. Day and dusk dim the chart with translucent neutral gray
// rising with cover, like overcast. Night-red uses a dim warm gray (red over green over blue, no
// blue dominance) so it never glows blue on a night watch. Alpha is capped so the chart reads
// through.
const DAY: Array<[number, Rgba]> = [
  [0, [0.86, 0.88, 0.92, 0.0]],
  [0.25, [0.82, 0.84, 0.88, 0.2]],
  [1, [0.78, 0.8, 0.85, 0.5]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.32, 0.22, 0.2, 0.0]],
  [1, [0.46, 0.3, 0.26, 0.45]],
];

export function cloudColor(fraction: number, theme: Theme): Rgba {
  return sampleRamp(theme === 'night-red' ? NIGHT : DAY, fraction);
}
