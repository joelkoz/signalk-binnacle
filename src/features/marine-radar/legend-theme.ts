import { forEachLegendByte, legendColorTable } from './legend';
import type { LegendEntry } from './radar-types';

// A legend entry whose label marks it as a Doppler or history/trail code keeps its accent color through
// theming, so approaching, receding, and trail returns stay distinguishable instead of flattening into
// the ramp (the night-red "alarms always distinguishable" rule).
function isAccent(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes('doppler') ||
    l.includes('approach') ||
    l.includes('reced') ||
    l.includes('history') ||
    l.includes('trail')
  );
}

// Theme the legend table for one coherent design system. Normal returns map onto the theme ramp:
// night-red keeps red on true black with green and blue zeroed so the brightest pixel stays low, dusk
// dims, day passes through. Accent codes (Doppler, history) are preserved. Built on legendColorTable,
// then re-themed in place per sample value, so each color is parsed once.
export function themedColorTable(
  legend: LegendEntry[],
  theme: 'day' | 'dusk' | 'night-red',
): Uint8Array {
  const table = legendColorTable(legend);
  if (theme === 'day') return table;
  forEachLegendByte(legend, (v, entry) => {
    if (v === 0 || isAccent(entry.label)) return;
    const o = v * 4;
    if (theme === 'night-red') {
      table[o] = Math.max(table[o], table[o + 1], table[o + 2]);
      table[o + 1] = 0;
      table[o + 2] = 0;
    } else {
      table[o] = Math.round(table[o] * 0.7);
      table[o + 1] = Math.round(table[o + 1] * 0.7);
      table[o + 2] = Math.round(table[o + 2] * 0.7);
    }
  });
  return table;
}
