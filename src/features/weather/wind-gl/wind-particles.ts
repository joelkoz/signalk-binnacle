import { RAMP_WIDTH } from '../wind-color-texture';
import type { WindField } from '../wind-field-texture';
import { DRAW_FRAG, DRAW_VERT, QUAD_VERT, SCREEN_FRAG, UPDATE_FRAG } from './shaders';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

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

function createTexture(
  gl: GL,
  filter: number,
  data: Uint8Array | null,
  w: number,
  h: number,
): WebGLTexture {
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
    createProgram(gl, QUAD_VERT, UPDATE_FRAG);
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
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      RAMP_WIDTH,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rampPixels,
    );
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
    gl.uniform2f(
      gl.getUniformLocation(this.#updateProgram, 'u_wind_min'),
      this.#field.uMin,
      this.#field.vMin,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.#updateProgram, 'u_wind_max'),
      this.#field.uMax,
      this.#field.vMax,
    );
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_rand_seed'), Math.random());
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_speed_factor'), this.#speedFactor);
    gl.uniform1f(gl.getUniformLocation(this.#updateProgram, 'u_drop_rate'), this.#dropRate);
    gl.uniform1f(
      gl.getUniformLocation(this.#updateProgram, 'u_drop_rate_bump'),
      this.#dropRateBump,
    );
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
    gl.uniform2f(
      gl.getUniformLocation(this.#drawProgram, 'u_wind_min'),
      this.#field.uMin,
      this.#field.vMin,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.#drawProgram, 'u_wind_max'),
      this.#field.uMax,
      this.#field.vMax,
    );
    gl.uniform4f(
      gl.getUniformLocation(this.#drawProgram, 'u_bounds'),
      this.#field.west,
      this.#field.south,
      this.#field.east,
      this.#field.north,
    );
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
