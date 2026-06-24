import type { LegendEntry } from './radar-types';

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

// A fallback intensity ramp for a radar that reports no legend: a transparent empty bin, then green to
// amber to red over the low 16 sample values (the common pixel-value depth), so the picture stays
// legible until the provider supplies its own legend.
export const DEFAULT_RADAR_LEGEND: LegendEntry[] = Array.from({ length: 16 }, (_, i) => {
  if (i === 0) return { color: '#00000000', label: 'none' };
  const t = (i - 1) / 14;
  const r = Math.round(t < 0.5 ? t * 2 * 255 : 255);
  const g = Math.round(t < 0.5 ? 200 : 200 * (1 - (t - 0.5) * 2));
  return { color: `#${hex2(r)}${hex2(g)}28ff`, label: `level ${i}` };
});

// Parse a #rrggbb or #rrggbbaa color. The 8-digit form (the Signal K legend uses it) carries alpha;
// the 6-digit form falls back to the supplied alpha.
export function hexToRgba(hex: string, fallbackAlpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16) || 0,
    Number.parseInt(h.slice(2, 4), 16) || 0,
    Number.parseInt(h.slice(4, 6), 16) || 0,
    h.length >= 8 ? Number.parseInt(h.slice(6, 8), 16) || 0 : fallbackAlpha,
  ];
}

// Visit every spoke sample value (0..255) with the legend entry that colors it. Entries carry explicit
// minValue/maxValue ranges (the Signal K form); without them the entry index is the sample value. Value
// 0 is the empty bin.
export function forEachLegendByte(
  legend: LegendEntry[],
  visit: (value: number, entry: LegendEntry) => void,
): void {
  const ranged = legend.some((e) => e.minValue !== undefined || e.maxValue !== undefined);
  if (ranged) {
    for (const entry of legend) {
      const lo = Math.max(0, Math.trunc(entry.minValue ?? 0));
      const hi = Math.min(255, Math.trunc(entry.maxValue ?? entry.minValue ?? 0));
      for (let v = lo; v <= hi; v += 1) visit(v, entry);
    }
  } else {
    for (let i = 0; i < legend.length && i < 256; i += 1) visit(i, legend[i]);
  }
}

// A 256-entry RGBA lookup table indexed by the raw spoke sample value. Value 0 is the empty bin and is
// transparent; values past the legend stay transparent so an out-of-range sample never paints.
export function legendColorTable(legend: LegendEntry[]): Uint8Array {
  const table = new Uint8Array(256 * 4);
  forEachLegendByte(legend, (v, entry) => {
    const [r, g, b, a] = hexToRgba(entry.color, 255);
    const o = v * 4;
    table[o] = r;
    table[o + 1] = g;
    table[o + 2] = b;
    table[o + 3] = v === 0 ? 0 : a;
  });
  return table;
}
