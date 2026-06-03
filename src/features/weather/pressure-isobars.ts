import type { TimeBracket, WeatherGrid } from '$entities/weather';

const PA_PER_HPA = 100;
const DEFAULT_INTERVAL_HPA = 4;
const LABEL_STRIDE = 6; // place a label every Nth segment of each level so labels stay sparse

type Pt = [number, number];

export interface Isobars {
  lines: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
}

// Edge crossings of a grid cell, named for the four sides: a bottom, b right, c top, d left. Each
// case lists the side pairs a contour segment connects. 5 and 10 are saddles, split with a fixed
// (non-averaged) choice, which is fine for smooth pressure fields where saddles are rare.
const CASES: string[][][] = [
  [],
  [['d', 'a']],
  [['a', 'b']],
  [['d', 'b']],
  [['b', 'c']],
  [
    ['d', 'a'],
    ['b', 'c'],
  ],
  [['a', 'c']],
  [['d', 'c']],
  [['c', 'd']],
  [['c', 'a']],
  [
    ['a', 'b'],
    ['c', 'd'],
  ],
  [['c', 'b']],
  [['d', 'b']],
  [['a', 'b']],
  [['d', 'a']],
  [],
];

// Isobars of mean-sea-level pressure at a fixed hPa interval, blended across the two bracketing
// forecast steps. Lines carry pressureHpa for labeling; pressure is stored in Pa, contoured in hPa.
export function isobarFeatures(
  grid: WeatherGrid,
  bracket: TimeBracket,
  intervalHpa = DEFAULT_INTERVAL_HPA,
): Isobars {
  const lines: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const p = grid.pressureMsl;
  if (!p || p.length === 0) return collections(lines, labels);

  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = p[bracket.lo] ?? [];
  const hi = p[bracket.hi] ?? lo;
  const field = (i: number): number => (lo[i] + (hi[i] - lo[i]) * bracket.frac) / PA_PER_HPA;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < cols * rows; i += 1) {
    const v = field(i);
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return collections(lines, labels);

  const perLevel = new Map<number, number>();
  for (let level = Math.ceil(min / intervalHpa) * intervalHpa; level <= max; level += intervalHpa) {
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const vbl = field(r * cols + c);
        const vbr = field(r * cols + c + 1);
        const vtr = field((r + 1) * cols + c + 1);
        const vtl = field((r + 1) * cols + c);
        if (Number.isNaN(vbl) || Number.isNaN(vbr) || Number.isNaN(vtr) || Number.isNaN(vtl)) {
          continue;
        }
        const idx =
          (vbl >= level ? 1 : 0) |
          (vbr >= level ? 2 : 0) |
          (vtr >= level ? 4 : 0) |
          (vtl >= level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const lon0 = grid.lons[c];
        const lon1 = grid.lons[c + 1];
        const lat0 = grid.lats[r];
        const lat1 = grid.lats[r + 1];
        const edge = (side: string): Pt => {
          switch (side) {
            case 'a':
              return [lerp(lon0, lon1, frac(vbl, vbr, level)), lat0];
            case 'b':
              return [lon1, lerp(lat0, lat1, frac(vbr, vtr, level))];
            case 'c':
              return [lerp(lon1, lon0, frac(vtr, vtl, level)), lat1];
            default:
              return [lon0, lerp(lat1, lat0, frac(vtl, vbl, level))];
          }
        };
        for (const [e1, e2] of CASES[idx]) {
          const a = edge(e1);
          const b = edge(e2);
          lines.push(lineFeature(a, b, level));
          const n = perLevel.get(level) ?? 0;
          if (n % LABEL_STRIDE === 0) {
            labels.push(pointFeature([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], level));
          }
          perLevel.set(level, n + 1);
        }
      }
    }
  }
  return collections(lines, labels);
}

function frac(va: number, vb: number, level: number): number {
  const d = vb - va;
  return d === 0 ? 0.5 : (level - va) / d;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lineFeature(a: Pt, b: Pt, pressureHpa: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [a, b] },
    properties: { pressureHpa },
  };
}

function pointFeature(at: Pt, pressureHpa: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: at },
    properties: { pressureHpa },
  };
}

function collections(lines: GeoJSON.Feature[], labels: GeoJSON.Feature[]): Isobars {
  return {
    lines: { type: 'FeatureCollection', features: lines },
    labels: { type: 'FeatureCollection', features: labels },
  };
}
