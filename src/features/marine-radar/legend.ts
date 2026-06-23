import type { RadarLegend } from './radar-types';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

// A 256-entry RGBA lookup table indexed by the raw spoke data byte. Index 0 is the empty bin and is
// transparent; indices past the legend stay transparent so an out-of-range byte never paints. The
// pixel `type` labels are not a per-sample key (the byte itself is the index); they drive theming
// elsewhere (legend-theme).
export function legendColorTable(legend: RadarLegend): Uint8Array {
  const table = new Uint8Array(256 * 4);
  for (let i = 0; i < legend.pixels.length && i < 256; i += 1) {
    const [r, g, b] = hexToRgb(legend.pixels[i].color);
    const o = i * 4;
    table[o] = r;
    table[o + 1] = g;
    table[o + 2] = b;
    table[o + 3] = i === 0 ? 0 : 255;
  }
  return table;
}
