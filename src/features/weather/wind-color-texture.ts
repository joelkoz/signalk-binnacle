import type { Theme } from '$shared/ui';
import { windColor } from './wind-colormap';

export const RAMP_WIDTH = 256;
export const RAMP_MAX_SPEED = 26; // m/s, the top of the wind colormap

// A 256x1 RGBA ramp from windColor across [0, RAMP_MAX_SPEED] for the theme, so the draw shader
// looks up a particle's color by its normalized speed. Rebuilt when the theme changes.
export function windColorTexture(theme: Theme): Uint8Array {
  const data = new Uint8Array(RAMP_WIDTH * 4);
  for (let i = 0; i < RAMP_WIDTH; i += 1) {
    const speed = (i / (RAMP_WIDTH - 1)) * RAMP_MAX_SPEED;
    const [r, g, b, a] = windColor(speed, theme);
    const o = i * 4;
    data[o] = Math.round(r * 255);
    data[o + 1] = Math.round(g * 255);
    data[o + 2] = Math.round(b * 255);
    data[o + 3] = Math.round(a * 255);
  }
  return data;
}
