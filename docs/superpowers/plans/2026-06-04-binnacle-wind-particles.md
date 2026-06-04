# Wind Particles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wind layer's line-arrow stand-in with an animated WebGL particle field in the weather mini-map: particles advect through the forecast u/v field, draw as speed-colored points with fading trails, theme for day, dusk, and night-red, and fall back to the arrow layer when WebGL is unavailable.

**Architecture:** A MapLibre `CustomLayerInterface` runs the webgl-wind GPU ping-pong particle simulation. Two pure modules build the byte wind texture (from the grid u/v) and the per-theme color ramp texture. A map-agnostic `WindParticles` engine owns the GL programs, textures, framebuffers, and the per-frame update/draw/trail passes. The overlay hosts the custom layer and falls back to today's arrow render when a capability probe fails. Particles live in grid-normalized geographic space; the draw shader projects them to the screen via the map matrix, so pan and zoom only reproject. Trails accumulate in a screen buffer that clears on a matrix change.

**Tech Stack:** TypeScript, raw WebGL (no new dependency), MapLibre GL JS 5 custom layer, Svelte 5, Vitest. Spec: `docs/superpowers/specs/2026-06-04-binnacle-wind-particles-design.md`.

**Pi build policy:** lead runs every verification, one heavy command at a time (`NODE_OPTIONS="--max-old-space-size=2048"`); gate green (biome, svelte-check, dependency-cruiser, vitest, build) before each commit; American English, no em dashes, Oxford commas, no "&" in text; minimal comments (why, not what). The GL passes are live-verified on the boat, not unit-tested.

---

## File structure

- Create `src/features/weather/wind-field-texture.ts`: pure, `windFieldTexture(grid, bracket) -> WindField | undefined`. Byte u/v texture, decode range, bounds, land sentinel. South-first rows (the shader samples it in up=north normalized space, unlike the north-flipped `field-rgba.ts` raster).
- Create `src/features/weather/wind-field-texture.test.ts`.
- Create `src/features/weather/wind-color-texture.ts`: pure, `windColorTexture(theme) -> Uint8Array` (256x1 RGBA) plus `RAMP_WIDTH`, `RAMP_MAX_SPEED`.
- Create `src/features/weather/wind-color-texture.test.ts`.
- Create `src/features/weather/wind-gl/shaders.ts`: the GLSL string constants.
- Create `src/features/weather/wind-gl/wind-particles.ts`: the `WindParticles` engine class and a `supportsWindGl()` capability probe.
- Modify `src/features/weather/wind-overlay.ts`: host the custom layer, fall back to the arrow layer.
- Unchanged: `wind-arrows.ts`, `wind-colormap.ts` (`windColor` reused), `index.ts` (still exports `createWindOverlay`), `WeatherMap`, `App`, `LayerManager`, the legend.

---

## Task 1: wind-field-texture (pure)

**Files:**
- Create: `src/features/weather/wind-field-texture.ts`
- Test: `src/features/weather/wind-field-texture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { windFieldTexture } from './wind-field-texture';

// A 2x2 grid, lats south-to-north [10, 20], lons west-to-east [0, 30]. cellIndex = latRow*2 + lonCol.
function grid(u: number[][], v: number[][]): WeatherGrid {
  return {
    lats: [10, 20],
    lons: [0, 30],
    times: [0, 3_600_000],
    windU: u,
    windV: v,
  } as WeatherGrid;
}
const bracket = { lo: 0, hi: 0, frac: 0 };

describe('windFieldTexture', () => {
  it('returns undefined when wind is absent', () => {
    expect(windFieldTexture(grid([], []), bracket)).toBeUndefined();
  });

  it('encodes u and v to bytes over their range, with bounds and south-first rows', () => {
    // u ranges -5..5, v ranges 0..10 across the four cells.
    const u = [[-5, 5, -5, 5]];
    const v = [[0, 0, 10, 10]];
    const f = windFieldTexture(grid(u, v), bracket);
    expect(f).toBeDefined();
    if (!f) return;
    expect(f.width).toBe(2);
    expect(f.height).toBe(2);
    expect([f.west, f.south, f.east, f.north]).toEqual([0, 10, 30, 20]);
    expect(f.uMin).toBe(-5);
    expect(f.uMax).toBe(5);
    expect(f.vMin).toBe(0);
    expect(f.vMax).toBe(10);
    // Row 0 of the texture is the southern grid row (cellIndex 0,1): u=-5 -> 0, u=5 -> 255.
    expect(f.data[0]).toBe(0); // cell (south,west) u byte
    expect(f.data[4]).toBe(255); // cell (south,east) u byte
    expect(f.data[3]).toBe(255); // alpha: data cell
  });

  it('marks NaN (land) cells with alpha 0', () => {
    const u = [[Number.NaN, 1, 1, 1]];
    const v = [[Number.NaN, 1, 1, 1]];
    const f = windFieldTexture(grid(u, v), bracket);
    expect(f?.data[3]).toBe(0); // first cell alpha
    expect(f?.data[7]).toBe(255); // second cell alpha
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/wind-field-texture.test.ts`
Expected: FAIL, `windFieldTexture` is not defined.

- [ ] **Step 3: Implement**

```ts
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
  const u = new Float64Array(cols * rows);
  const v = new Float64Array(cols * rows);
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
    data[o + 2] = 0;
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
```

- [ ] **Step 4: Run the test, expect pass**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/wind-field-texture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
/usr/local/bin/biome check --write src/features/weather/wind-field-texture.ts src/features/weather/wind-field-texture.test.ts
git add src/features/weather/wind-field-texture.ts src/features/weather/wind-field-texture.test.ts
git commit -m "feat(weather): wind field texture builder for the particle layer"
```

---

## Task 2: wind-color-texture (pure)

**Files:**
- Create: `src/features/weather/wind-color-texture.ts`
- Test: `src/features/weather/wind-color-texture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { windColor } from './wind-colormap';
import { RAMP_MAX_SPEED, RAMP_WIDTH, windColorTexture } from './wind-color-texture';

describe('windColorTexture', () => {
  it('is a 256x1 RGBA ramp', () => {
    expect(windColorTexture('day')).toHaveLength(RAMP_WIDTH * 4);
  });

  it('matches windColor at the endpoints', () => {
    const ramp = windColorTexture('day');
    const [r, g, b] = windColor(0, 'day');
    expect(ramp[0]).toBe(Math.round(r * 255));
    expect(ramp[1]).toBe(Math.round(g * 255));
    expect(ramp[2]).toBe(Math.round(b * 255));
    const last = (RAMP_WIDTH - 1) * 4;
    const [r2, g2, b2] = windColor(RAMP_MAX_SPEED, 'day');
    expect(ramp[last]).toBe(Math.round(r2 * 255));
    expect(ramp[last + 1]).toBe(Math.round(g2 * 255));
    expect(ramp[last + 2]).toBe(Math.round(b2 * 255));
  });

  it('keeps night-red free of blue', () => {
    const ramp = windColorTexture('night-red');
    for (let i = 0; i < RAMP_WIDTH; i += 1) {
      expect(ramp[i * 4 + 2]).toBeLessThanOrEqual(20); // blue channel stays near zero
    }
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/wind-color-texture.test.ts`
Expected: FAIL, `windColorTexture` is not defined.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the test, expect pass**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/wind-color-texture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
/usr/local/bin/biome check --write src/features/weather/wind-color-texture.ts src/features/weather/wind-color-texture.test.ts
git add src/features/weather/wind-color-texture.ts src/features/weather/wind-color-texture.test.ts
git commit -m "feat(weather): per-theme wind color ramp texture"
```

---

## Task 3: GLSL shaders

**Files:**
- Create: `src/features/weather/wind-gl/shaders.ts`

No unit test (GLSL strings; compiled and verified live in Task 5).

- [ ] **Step 1: Write the shader sources**

```ts
// webgl-wind technique (Vladimir Agafonkin, ISC), adapted to MapLibre: the draw vertex shader
// projects each particle from grid-normalized space through lon/lat and mercator to the map matrix,
// so the simulation stays camera-independent. Particle positions are byte-packed (two bytes per
// coordinate) so the layer works on WebGL1 and WebGL2 without float-texture extensions.

// A full-screen quad, used by the update pass and the screen draw pass.
export const QUAD_VERT = `
precision mediump float;
attribute vec2 a_pos;
varying vec2 v_tex_pos;
void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0.0, 1.0);
}`;

// Draw a screen texture with an opacity factor; used to fade the trail buffer and to blit it out.
export const SCREEN_FRAG = `
precision mediump float;
uniform sampler2D u_screen;
uniform float u_opacity;
varying vec2 v_tex_pos;
void main() {
  vec4 color = texture2D(u_screen, 1.0 - v_tex_pos);
  gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
}`;

// Advance every particle by the wind at its position; randomly respawn to avoid clumping and to
// reseed particles that flow off-grid or onto land (alpha 0) cells.
export const UPDATE_FRAG = `
precision highp float;
uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_rand_seed;
uniform float u_speed_factor;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;
varying vec2 v_tex_pos;

const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
  float t = dot(rand_constants.xy, co);
  return fract(sin(t) * (rand_constants.z + t));
}

void main() {
  vec4 color = texture2D(u_particles, v_tex_pos);
  vec2 pos = vec2(color.r / 255.0 + color.b, color.g / 255.0 + color.a);
  vec4 w = texture2D(u_wind, pos);
  vec2 velocity = w.a < 0.5 ? vec2(0.0) : mix(u_wind_min, u_wind_max, w.rg);
  float speed_t = length(velocity) / length(u_wind_max);
  // v is northward; normalized y increases north, so move +v in y.
  vec2 offset = vec2(velocity.x, velocity.y) * u_speed_factor;
  pos = fract(1.0 + pos + offset);
  vec2 seed = (pos + v_tex_pos) * u_rand_seed;
  float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump;
  float drop = step(1.0 - drop_rate, rand(seed));
  bool land = w.a < 0.5;
  float reset = max(drop, land ? 1.0 : 0.0);
  vec2 random_pos = vec2(rand(seed + 1.3), rand(seed + 2.1));
  pos = mix(pos, random_pos, reset);
  gl_FragColor = vec4(fract(pos * 255.0), floor(pos * 255.0) / 255.0);
}`;

// Project a particle to the screen via lon/lat and mercator, and pass its speed for coloring.
export const DRAW_VERT = `
precision mediump float;
attribute float a_index;
uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_particles_res;
uniform mat4 u_matrix;
uniform vec4 u_bounds;
varying float v_speed_t;
const float PI = 3.141592653589793;
void main() {
  vec4 color = texture2D(u_particles, vec2(
    fract(a_index / u_particles_res),
    floor(a_index / u_particles_res) / u_particles_res));
  vec2 pos = vec2(color.r / 255.0 + color.b, color.g / 255.0 + color.a);
  vec4 w = texture2D(u_wind, pos);
  vec2 velocity = w.a < 0.5 ? vec2(0.0) : mix(u_wind_min, u_wind_max, w.rg);
  v_speed_t = length(velocity) / length(u_wind_max);
  float lon = mix(u_bounds.x, u_bounds.z, pos.x);
  float lat = mix(u_bounds.y, u_bounds.w, pos.y);
  float mx = (lon + 180.0) / 360.0;
  float my = (180.0 - (180.0 / PI) * log(tan(PI / 4.0 + lat * PI / 360.0))) / 360.0;
  gl_Position = u_matrix * vec4(mx, my, 0.0, 1.0);
  gl_PointSize = 1.5;
}`;

// Color the particle by its normalized speed from the ramp texture.
export const DRAW_FRAG = `
precision mediump float;
uniform sampler2D u_color_ramp;
varying float v_speed_t;
void main() {
  gl_FragColor = texture2D(u_color_ramp, vec2(clamp(v_speed_t, 0.0, 1.0), 0.5));
}`;
```

- [ ] **Step 2: Commit**

```bash
/usr/local/bin/biome check --write src/features/weather/wind-gl/shaders.ts
git add src/features/weather/wind-gl/shaders.ts
git commit -m "feat(weather): wind particle GLSL shaders"
```

---

## Task 4: WindParticles engine and capability probe

**Files:**
- Create: `src/features/weather/wind-gl/wind-particles.ts`

The engine is map-agnostic and verified live in Task 5 (no unit test for GL passes).

- [ ] **Step 1: Implement the engine and probe**

```ts
import type { WindField } from '../wind-field-texture';
import { RAMP_WIDTH } from '../wind-color-texture';
import { DRAW_FRAG, DRAW_VERT, QUAD_VERT, SCREEN_FRAG, UPDATE_FRAG } from './shaders';

type GL = WebGLRenderingContext;

export interface WindParticlesOptions {
  // Square root of the particle count; particleCount = resolution^2. ~90 gives ~8100 on a Pi GPU.
  resolution?: number;
  speedFactor?: number;
  dropRate?: number;
  dropRateBump?: number;
  fadeOpacity?: number;
}

function createShader(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  }
  return shader;
}

function createProgram(gl: GL, vert: string, frag: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
  }
  return program;
}

function createTexture(gl: GL, filter: number, data: Uint8Array | null, w: number, h: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function createBuffer(gl: GL, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('createBuffer failed');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

// A lightweight probe: can this environment compile the wind programs on a throwaway context? Used
// by the overlay to choose particles vs the arrow fallback before touching the map.
export function supportsWindGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as GL | null;
    if (!gl) return false;
    createProgram(gl, UPDATE_FRAG.includes('void') ? QUAD_VERT : QUAD_VERT, UPDATE_FRAG);
    createProgram(gl, DRAW_VERT, DRAW_FRAG);
    return true;
  } catch {
    return false;
  }
}

export class WindParticles {
  #gl: GL;
  #updateProgram: WebGLProgram;
  #drawProgram: WebGLProgram;
  #screenProgram: WebGLProgram;
  #quadBuffer: WebGLBuffer;
  #indexBuffer: WebGLBuffer;
  #framebuffer: WebGLFramebuffer;
  #colorRamp: WebGLTexture;
  #wind: WebGLTexture | undefined;
  #field: WindField | undefined;
  #state0: WebGLTexture;
  #state1: WebGLTexture;
  #screen0: WebGLTexture;
  #screen1: WebGLTexture;
  #screenW = 0;
  #screenH = 0;
  #res: number;
  #count: number;
  #speedFactor: number;
  #dropRate: number;
  #dropRateBump: number;
  #fadeOpacity: number;
  #opacity = 1;

  constructor(gl: GL, options: WindParticlesOptions = {}) {
    this.#gl = gl;
    this.#res = options.resolution ?? 90;
    this.#count = this.#res * this.#res;
    this.#speedFactor = options.speedFactor ?? 0.0008;
    this.#dropRate = options.dropRate ?? 0.003;
    this.#dropRateBump = options.dropRateBump ?? 0.01;
    this.#fadeOpacity = options.fadeOpacity ?? 0.96;
    this.#updateProgram = createProgram(gl, QUAD_VERT, UPDATE_FRAG);
    this.#drawProgram = createProgram(gl, DRAW_VERT, DRAW_FRAG);
    this.#screenProgram = createProgram(gl, QUAD_VERT, SCREEN_FRAG);
    this.#quadBuffer = createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]));
    const indices = new Float32Array(this.#count);
    for (let i = 0; i < this.#count; i += 1) indices[i] = i;
    this.#indexBuffer = createBuffer(gl, indices);
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error('createFramebuffer failed');
    this.#framebuffer = fb;
    this.#colorRamp = createTexture(gl, gl.LINEAR, null, RAMP_WIDTH, 1);
    const seed = this.#randomState();
    this.#state0 = createTexture(gl, gl.NEAREST, seed, this.#res, this.#res);
    this.#state1 = createTexture(gl, gl.NEAREST, seed, this.#res, this.#res);
    this.#screen0 = createTexture(gl, gl.NEAREST, null, 1, 1);
    this.#screen1 = createTexture(gl, gl.NEAREST, null, 1, 1);
  }

  #randomState(): Uint8Array {
    const state = new Uint8Array(this.#count * 4);
    for (let i = 0; i < state.length; i += 1) state[i] = Math.floor(Math.random() * 256);
    return state;
  }

  setWind(field: WindField): void {
    this.#field = field;
    const gl = this.#gl;
    if (this.#wind) gl.deleteTexture(this.#wind);
    this.#wind = createTexture(gl, gl.LINEAR, field.data, field.width, field.height);
  }

  setTheme(rampPixels: Uint8Array): void {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#colorRamp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RAMP_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rampPixels);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  setOpacity(opacity: number): void {
    this.#opacity = opacity;
  }

  #resizeScreen(w: number, h: number): void {
    if (w === this.#screenW && h === this.#screenH) return;
    const gl = this.#gl;
    gl.deleteTexture(this.#screen0);
    gl.deleteTexture(this.#screen1);
    const empty = new Uint8Array(w * h * 4);
    this.#screen0 = createTexture(gl, gl.NEAREST, empty, w, h);
    this.#screen1 = createTexture(gl, gl.NEAREST, empty, w, h);
    this.#screenW = w;
    this.#screenH = h;
  }

  #bindAttribute(buffer: WebGLBuffer, location: number, size: number): void {
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  #drawTexture(texture: WebGLTexture, opacity: number): void {
    const gl = this.#gl;
    gl.useProgram(this.#screenProgram);
    this.#bindAttribute(this.#quadBuffer, gl.getAttribLocation(this.#screenProgram, 'a_pos'), 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(this.#screenProgram, 'u_screen'), 0);
    gl.uniform1f(gl.getUniformLocation(this.#screenProgram, 'u_opacity'), opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  #updateParticles(): void {
    const gl = this.#gl;
    if (!this.#wind || !this.#field) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.#state1, 0);
    gl.viewport(0, 0, this.#res, this.#res);
    gl.useProgram(this.#updateProgram);
    this.#bindAttribute(this.#quadBuffer, gl.getAttribLocation(this.#updateProgram, 'a_pos'), 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#state0);
    gl.uniform1i(gl.getUniformLocation(this.#updateProgram, 'u_particles'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#wind);
    gl.uniform1i(gl.getUniformLocation(this.#updateProgram, 'u_wind'), 1);
    gl.uniform2f(gl.getUniformLocation(this.#updateProgram, 'u_wind_min'), this.#field.uMin, this.#field.vMin);
    gl.uniform2f(gl.getUniformLocation(this.#updateProgram, 'u_wind_max'), this.#field.uMax, this.#field.vMax);
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_rand_seed'), Math.random());
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_speed_factor'), this.#speedFactor);
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_drop_rate'), this.#dropRate);
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_drop_rate_bump'), this.#dropRateBump);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const tmp = this.#state0;
    this.#state0 = this.#state1;
    this.#state1 = tmp;
  }

  #drawParticles(matrix: Float32Array | number[]): void {
    const gl = this.#gl;
    if (!this.#wind || !this.#field) return;
    gl.useProgram(this.#drawProgram);
    this.#bindAttribute(this.#indexBuffer, gl.getAttribLocation(this.#drawProgram, 'a_index'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#state0);
    gl.uniform1i(gl.getUniformLocation(this.#drawProgram, 'u_particles'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#wind);
    gl.uniform1i(gl.getUniformLocation(this.#drawProgram, 'u_wind'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.#colorRamp);
    gl.uniform1i(gl.getUniformLocation(this.#drawProgram, 'u_color_ramp'), 2);
    gl.uniform1f(gl.getUniformLocation(this.#drawProgram, 'u_particles_res'), this.#res);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.#drawProgram, 'u_matrix'), false, matrix);
    gl.uniform2f(gl.getUniformLocation(this.#drawProgram, 'u_wind_min'), this.#field.uMin, this.#field.vMin);
    gl.uniform2f(gl.getUniformLocation(this.#drawProgram, 'u_wind_max'), this.#field.uMax, this.#field.vMax);
    gl.uniform4f(gl.getUniformLocation(this.#drawProgram, 'u_bounds'), this.#field.west, this.#field.south, this.#field.east, this.#field.north);
    gl.drawArrays(gl.POINTS, 0, this.#count);
  }

  // Run the update, draw into the fading trail buffer, and blit to the map. `moved` clears the trail
  // so screen-space accumulation never smears after a pan or zoom.
  render(matrix: Float32Array | number[], widthPx: number, heightPx: number, moved: boolean): void {
    const gl = this.#gl;
    if (!this.#wind || !this.#field) return;
    this.#resizeScreen(widthPx, heightPx);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    this.#updateParticles();

    // Draw the faded previous trail plus the new particles into screen1.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.#screen1, 0);
    gl.viewport(0, 0, widthPx, heightPx);
    if (moved) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      this.#drawTexture(this.#screen0, this.#fadeOpacity);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.#drawParticles(matrix);
    gl.disable(gl.BLEND);

    // Blit the trail buffer onto the map at the layer opacity.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.#drawTexture(this.#screen1, this.#opacity);
    gl.disable(gl.BLEND);

    const tmp = this.#screen0;
    this.#screen0 = this.#screen1;
    this.#screen1 = tmp;
  }

  dispose(): void {
    const gl = this.#gl;
    gl.deleteProgram(this.#updateProgram);
    gl.deleteProgram(this.#drawProgram);
    gl.deleteProgram(this.#screenProgram);
    gl.deleteBuffer(this.#quadBuffer);
    gl.deleteBuffer(this.#indexBuffer);
    gl.deleteFramebuffer(this.#framebuffer);
    gl.deleteTexture(this.#colorRamp);
    gl.deleteTexture(this.#state0);
    gl.deleteTexture(this.#state1);
    gl.deleteTexture(this.#screen0);
    gl.deleteTexture(this.#screen1);
    if (this.#wind) gl.deleteTexture(this.#wind);
  }
}
```

- [ ] **Step 2: Type-check and commit**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
Expected: 0 errors.

```bash
/usr/local/bin/biome check --write src/features/weather/wind-gl/wind-particles.ts
git add src/features/weather/wind-gl/wind-particles.ts
git commit -m "feat(weather): WindParticles WebGL engine and capability probe"
```

Note for the implementer: the `supportsWindGl` body's `UPDATE_FRAG.includes(...)` ternary is a lint-safe way to reference both imports if biome flags an unused import; if both shaders are otherwise referenced, simplify to `createProgram(gl, QUAD_VERT, UPDATE_FRAG)`.

---

## Task 5: Rewrite wind-overlay to host the custom layer with the arrow fallback

**Files:**
- Modify: `src/features/weather/wind-overlay.ts`

- [ ] **Step 1: Implement**

Replace the file with the dual-path overlay. The arrow path is the current code, kept verbatim as the fallback; the particle path adds the custom layer.

```ts
import type { CustomLayerInterface, ExpressionSpecification, GeoJSONSourceSpecification, LineLayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import { emptyFeatureCollection } from './feature-collection';
import { WEATHER_LAYER_IDS } from './fills';
import { windArrowFeatures } from './wind-arrows';
import { windColorExpression } from './wind-colormap';
import { windColorTexture } from './wind-color-texture';
import { windFieldTexture } from './wind-field-texture';
import { supportsWindGl, WindParticles } from './wind-gl/wind-particles';

const SOURCE_ID = 'binnacle-weather-wind';
const LAYER_ID = 'binnacle-weather-wind-line';
const GL_LAYER_ID = 'binnacle-weather-wind-particles';

export interface WindOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// MapLibre 5 passes a render-args object carrying the projection matrix; older builds pass the
// matrix directly. Accept both.
function matrixOf(args: unknown): number[] {
  if (Array.isArray(args)) return args;
  const data = (args as { defaultProjectionData?: { mainMatrix?: number[] } }).defaultProjectionData;
  return data?.mainMatrix ?? [];
}

export function createWindOverlay(store: WeatherStore): WindOverlay {
  const useParticles = supportsWindGl();
  let theme: Theme = 'day';
  let opacity = 1;
  let visible = false;
  let lastGrid: unknown;
  let lastTime = Number.NaN;

  // Particle path.
  let particles: WindParticles | undefined;
  let lastMatrix = '';

  // Arrow fallback path.
  function colorExpr(t: Theme): ExpressionSpecification {
    return windColorExpression(t) as unknown as ExpressionSpecification;
  }

  function addArrowLayer(ctx: OverlayContext): void {
    if (!ctx.map.getSource(SOURCE_ID)) {
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: emptyFeatureCollection() };
      ctx.map.addSource(SOURCE_ID, source);
    }
    if (!ctx.map.getLayer(LAYER_ID)) {
      const layer: LineLayerSpecification = {
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', visibility: visible ? 'visible' : 'none' },
        paint: { 'line-color': colorExpr(theme), 'line-width': 2, 'line-opacity': opacity },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
    }
  }

  function pushWind(): void {
    if (!particles) return;
    const grid = store.grid;
    const field = grid ? windFieldTexture(grid, store.bracket) : undefined;
    if (field) particles.setWind(field);
  }

  function addParticleLayer(ctx: OverlayContext): void {
    const layer: CustomLayerInterface = {
      id: GL_LAYER_ID,
      type: 'custom',
      onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
        try {
          particles = new WindParticles(gl);
          particles.setTheme(windColorTexture(theme));
          particles.setOpacity(opacity);
          pushWind();
        } catch (error) {
          console.warn('[wind] particle init failed, falling back to arrows', error);
          particles = undefined;
          if (map.getLayer(GL_LAYER_ID)) map.removeLayer(GL_LAYER_ID);
          addArrowLayer(ctx);
          syncArrows(ctx);
        }
      },
      render(gl: WebGLRenderingContext, args: unknown) {
        if (!particles || !visible) return;
        const matrix = matrixOf(args);
        const key = matrix.join(',');
        const moved = key !== lastMatrix;
        lastMatrix = key;
        particles.render(matrix, gl.drawingBufferWidth, gl.drawingBufferHeight, moved);
        ctx.map.triggerRepaint();
      },
      onRemove() {
        particles?.dispose();
        particles = undefined;
      },
    };
    ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
  }

  function syncArrows(ctx: OverlayContext): void {
    const grid = store.grid;
    const source = ctx.map.getSource(SOURCE_ID) as { setData(d: unknown): void } | undefined;
    source?.setData(grid ? windArrowFeatures(grid, store.bracket) : emptyFeatureCollection());
  }

  return {
    id: WEATHER_LAYER_IDS.wind,
    title: 'Wind',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [useParticles ? GL_LAYER_ID : LAYER_ID],
    add(ctx) {
      if (useParticles) addParticleLayer(ctx);
      else addArrowLayer(ctx);
    },
    sync(ctx) {
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      if (particles) pushWind();
      else if (ctx.map.getLayer(LAYER_ID)) syncArrows(ctx);
    },
    remove(ctx) {
      if (ctx.map.getLayer(GL_LAYER_ID)) ctx.map.removeLayer(GL_LAYER_ID);
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, value) {
      visible = value;
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setLayoutProperty(LAYER_ID, 'visibility', value ? 'visible' : 'none');
      }
      if (value) ctx.map.triggerRepaint();
    },
    setOpacity(ctx, value) {
      opacity = value;
      particles?.setOpacity(value);
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.setPaintProperty(LAYER_ID, 'line-opacity', value);
    },
    applyTheme(ctx, paint) {
      theme = paint.theme;
      particles?.setTheme(windColorTexture(theme));
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.setPaintProperty(LAYER_ID, 'line-color', colorExpr(theme));
    },
  };
}
```

- [ ] **Step 2: Full gate**

Run each one at a time:
- `/usr/local/bin/biome check --write .`
- `NODE_OPTIONS="--max-old-space-size=2048" npm run check` (expect 0 errors)
- `NODE_OPTIONS="--max-old-space-size=2048" npm run cruise` (expect 0 violations)
- `NODE_OPTIONS="--max-old-space-size=2048" npm test` (expect all pass, including the two new suites)
- `NODE_OPTIONS="--max-old-space-size=2048" npm run build` (expect success)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(weather): animate wind as a WebGL particle field, arrow fallback"
```

---

## Task 6: Live verification, simplify, push, cleanup

- [ ] **Step 1: Push** (pre-push runs the full chain).

```bash
git push origin main
```

- [ ] **Step 2: Live-verify on the boat** (Playwright over `https://boatpi:3443/binnacle/`, nssdb-trusted CA, no TLS bypass). Seed `binnacle:theme` and `binnacle:map-view` (a wind-rich area, for example `{lat:45,lon:-25,zoom:4}`), open the Forecast panel (Wind is on by default), wait for the grid, screenshot, and read back. Confirm in all three themes: particles stream along the wind, faster wind reads hotter on the ramp, trails fade and reset cleanly on pan and zoom, night-red shows red on black with no blue, the Wind pill toggles the layer and the opacity slider fades it, and the legend still shows the wind ramp. Capture screenshots to `tmp/` and view them. Re-run if OpenFreeMap rate-limits (a run with zero forecast responses is a network failure, not a bug).

- [ ] **Step 3: Verify the fallback** by forcing it: temporarily make `supportsWindGl()` return false (or seed a context-loss), confirm the arrow layer renders with the same toggle, opacity, theme, and legend, then revert.

- [ ] **Step 4: `/simplify`** the diff; apply findings (skip false positives with a one-line reason).

- [ ] **Step 5: `/cleanup` gate** if warranted, then update `CHANGELOG.md` and the README "What's New" (wind is now an animated particle field), and the project-status memory. Commit and push.

---

## Self-review notes

- Spec coverage: renderer (Task 4, 5), trails with reset-on-move (Task 4 `render` `moved`, Task 5 matrix-change detection), fallback to arrows (Task 5 `supportsWindGl` branch plus the onAdd catch), theming (Task 2, `applyTheme`), Pi caps (resolution 90, repaint only while visible), pure-module tests (Tasks 1, 2), live-verified GL (Task 6). All covered.
- Type consistency: `WindField` (Task 1) is consumed by `WindParticles.setWind` and `windFieldTexture` (Task 5). `RAMP_WIDTH`/`RAMP_MAX_SPEED` (Task 2) used by the ramp texture and the engine. `WindParticles`, `supportsWindGl` (Task 4) used by the overlay (Task 5). `createWindOverlay` keeps its signature, so `WeatherMap` is unchanged.
- The `speedFactor`, `dropRate`, `dropRateBump`, and `fadeOpacity` defaults are live-tuning knobs; expect to adjust them once on the boat (Task 6), which is normal for a particle field and does not change the interfaces.
