import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';

export interface WindField {
  // RGBA bytes, width x height. R = u byte, G = v byte (each over [min, max]); A = 255 for data
  // cells, 0 over land (NaN) so the update shader respawns particles there. Rows are south-first.
  data: Uint8Array;
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

// Build the wind texture from the grid's u/v at the blended bracket. Returns undefined when wind is
// absent. Row 0 is the southern grid row, so the shader can sample it directly in up=north
// normalized space (the opposite of field-rgba.ts, which north-flips for a top-down canvas raster).
export function windFieldTexture(grid: WeatherGrid, bracket: TimeBracket): WindField | undefined {
  const uLo = grid.windU[bracket.lo];
  const vLo = grid.windV[bracket.lo];
  if (!uLo || !vLo || uLo.length === 0) return undefined;
  const uHi = grid.windU[bracket.hi] ?? uLo;
  const vHi = grid.windV[bracket.hi] ?? vLo;
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const u = new Float32Array(cols * rows);
  const v = new Float32Array(cols * rows);
  let uMin = Number.POSITIVE_INFINITY;
  let uMax = Number.NEGATIVE_INFINITY;
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < cols * rows; i += 1) {
    const uu = lerp(uLo[i], uHi[i], bracket.frac);
    const vv = lerp(vLo[i], vHi[i], bracket.frac);
    u[i] = uu;
    v[i] = vv;
    if (!Number.isNaN(uu)) {
      uMin = Math.min(uMin, uu);
      uMax = Math.max(uMax, uu);
    }
    if (!Number.isNaN(vv)) {
      vMin = Math.min(vMin, vv);
      vMax = Math.max(vMax, vv);
    }
  }
  if (uMin > uMax) {
    uMin = -1;
    uMax = 1;
  }
  if (vMin > vMax) {
    vMin = -1;
    vMax = 1;
  }
  const uSpan = uMax - uMin || 1;
  const vSpan = vMax - vMin || 1;
  const data = new Uint8Array(cols * rows * 4);
  for (let i = 0; i < cols * rows; i += 1) {
    const o = i * 4;
    const land = Number.isNaN(u[i]) || Number.isNaN(v[i]);
    data[o] = land ? 0 : Math.round(((u[i] - uMin) / uSpan) * 255);
    data[o + 1] = land ? 0 : Math.round(((v[i] - vMin) / vSpan) * 255);
    data[o + 3] = land ? 0 : 255;
  }
  return {
    data,
    width: cols,
    height: rows,
    uMin,
    uMax,
    vMin,
    vMax,
    west: grid.lons[0],
    south: grid.lats[0],
    east: grid.lons[cols - 1],
    north: grid.lats[rows - 1],
  };
}
