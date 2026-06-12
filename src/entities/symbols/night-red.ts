// Night-red treatment for user-provided symbol bitmaps: arbitrary SVG colors cannot be trusted
// on the night chart, so every pixel's luminance is mapped into the red band (r = luminance,
// g = 0, b = 0) and the alpha is dimmed so the brightest pixel stays low.
export const NIGHT_RED_ALPHA = 0.8;

// Rec. 709 luma weights, matching how the eye reads the source colors' brightness.
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function mapLuminanceToRed(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(LUMA_R * data[i] + LUMA_G * data[i + 1] + LUMA_B * data[i + 2]);
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = Math.round(data[i + 3] * NIGHT_RED_ALPHA);
  }
}
