import type { Theme } from '$shared/ui';
import { type Rgba, sampleRamp } from './color-ramp';

// Cloud-cover stops as a 0..1 fraction. Day and dusk dim the chart with a translucent neutral gray
// rising with cover, like overcast; the gray is mid-tone (not near-white) so it reads clearly over
// the light base map and the ocean. Night-red uses a dim warm gray (red over green over blue, no
// blue dominance) so it never glows blue on a night watch. Alpha is capped so the chart reads
// through.
const DAY: Array<[number, Rgba]> = [
  [0, [0.7, 0.71, 0.74, 0.0]],
  [0.3, [0.58, 0.59, 0.62, 0.32]],
  [1, [0.42, 0.43, 0.46, 0.62]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.34, 0.22, 0.2, 0.0]],
  [1, [0.5, 0.32, 0.28, 0.5]],
];

export function cloudColor(fraction: number, theme: Theme): Rgba {
  return sampleRamp(theme === 'night-red' ? NIGHT : DAY, fraction);
}
