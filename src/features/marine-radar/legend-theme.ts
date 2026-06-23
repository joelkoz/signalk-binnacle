import { legendColorTable } from './legend';
import type { PixelType, RadarLegend } from './radar-types';

const ACCENT_TYPES: ReadonlySet<PixelType> = new Set<PixelType>([
  'DopplerApproaching',
  'DopplerReceding',
  'DopplerRain',
]);

// Theme the legend table for one coherent design system. Normal returns map onto the theme ramp:
// night-red keeps red on true black with green and blue zeroed so the brightest pixel stays low,
// dusk dims, day passes through. History and Doppler keep distinguishable accents so approaching,
// receding, and trail codes survive theming instead of flattening into the ramp.
export function themedColorTable(
  legend: RadarLegend,
  theme: 'day' | 'dusk' | 'night-red',
): Uint8Array {
  const table = legendColorTable(legend);
  if (theme === 'day') return table;
  for (let i = 1; i < legend.pixels.length && i < 256; i += 1) {
    const type = legend.pixels[i].type;
    const o = i * 4;
    if (type === 'History' || ACCENT_TYPES.has(type)) continue;
    if (theme === 'night-red') {
      const r = Math.max(table[o], table[o + 1], table[o + 2]);
      table[o] = r;
      table[o + 1] = 0;
      table[o + 2] = 0;
    } else {
      table[o] = Math.round(table[o] * 0.7);
      table[o + 1] = Math.round(table[o + 1] * 0.7);
      table[o + 2] = Math.round(table[o + 2] * 0.7);
    }
  }
  return table;
}
