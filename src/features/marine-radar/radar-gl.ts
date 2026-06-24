// position.xy is a mercator-coordinate quad corner; local.xy is the corner in [-1,1] for polar mapping.
export function quadVertices(cx: number, cy: number, half: number): Float32Array {
  const x0 = cx - half;
  const x1 = cx + half;
  const y0 = cy - half;
  const y1 = cy + half;
  // biome-ignore format: one [posX, posY, localX, localY] vertex per line reads as the quad it is.
  return new Float32Array([
    x0, y0, -1, -1,
    x1, y0, 1, -1,
    x0, y1, -1, 1,
    x1, y0, 1, -1,
    x1, y1, 1, 1,
    x0, y1, -1, 1,
  ]);
}

const VERT = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
in vec2 a_pos;
in vec2 a_local;
out vec2 v_local;
void main() {
  v_local = a_local;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_data;
uniform sampler2D u_legend;
uniform float u_heading;
uniform float u_opacity;
in vec2 v_local;
out vec4 fragColor;
const float PI = 3.141592653589793;
void main() {
  float r = length(v_local);
  if (r > 1.0) discard;
  float theta = atan(v_local.x, v_local.y) - u_heading;
  float a = mod(theta / (2.0 * PI), 1.0);
  // The data texel is a legend INDEX, sampled NEAREST so it is never interpolated. Recover the
  // integer 0..255 index from the R8-normalized value before looking it up in the 256-wide legend,
  // so a high-end code (Doppler, History) lands on its own legend entry, not a neighbor.
  float idx = floor(texture(u_data, vec2(a, r)).r * 255.0 + 0.5);
  vec4 color = texture(u_legend, vec2((idx + 0.5) / 256.0, 0.5));
  fragColor = vec4(color.rgb, color.a * u_opacity);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type) as WebGLShader;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`radar shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

interface Locations {
  pos: number;
  local: number;
  matrix: WebGLUniformLocation | null;
  heading: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  data: WebGLUniformLocation | null;
  legend: WebGLUniformLocation | null;
}

export class RadarGl {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #buffer: WebGLBuffer;
  readonly #dataTex: WebGLTexture;
  readonly #legendTex: WebGLTexture;
  // Attribute and uniform locations are static after link, so they are looked up once here rather than
  // by string on every frame.
  readonly #loc: Locations;
  #spokes = 0;
  #texW = 0;
  #texH = 0;
  #opacity = 1;
  #heading = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    const program = gl.createProgram() as WebGLProgram;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`radar program: ${gl.getProgramInfoLog(program)}`);
    }
    this.#program = program;
    this.#buffer = gl.createBuffer() as WebGLBuffer;
    this.#dataTex = gl.createTexture() as WebGLTexture;
    this.#legendTex = gl.createTexture() as WebGLTexture;
    this.#loc = {
      pos: gl.getAttribLocation(program, 'a_pos'),
      local: gl.getAttribLocation(program, 'a_local'),
      matrix: gl.getUniformLocation(program, 'u_matrix'),
      heading: gl.getUniformLocation(program, 'u_heading'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
      data: gl.getUniformLocation(program, 'u_data'),
      legend: gl.getUniformLocation(program, 'u_legend'),
    };
  }

  setData(buffer: ArrayBuffer, spokesPerRev: number, maxSpokeLen: number): void {
    if (spokesPerRev <= 0 || maxSpokeLen <= 0) return;
    const gl = this.#gl;
    this.#spokes = spokesPerRev;
    const pixels = new Uint8Array(buffer);
    gl.bindTexture(gl.TEXTURE_2D, this.#dataTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (spokesPerRev !== this.#texW || maxSpokeLen !== this.#texH) {
      // First upload or a size change: allocate and set the filters. The data texel is a palette
      // index, so it is sampled NEAREST (interpolating indices would blend to unrelated colors).
      this.#texW = spokesPerRev;
      this.#texH = maxSpokeLen;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        spokesPerRev,
        maxSpokeLen,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        spokesPerRev,
        maxSpokeLen,
        gl.RED,
        gl.UNSIGNED_BYTE,
        pixels,
      );
    }
  }

  setLegend(rgba: Uint8Array): void {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#legendTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setOpacity(o: number): void {
    this.#opacity = o;
  }

  setHeading(rad: number): void {
    this.#heading = rad;
  }

  render(matrix: number[], cx: number, cy: number, half: number): void {
    const gl = this.#gl;
    if (this.#spokes === 0) return;
    const loc = this.#loc;
    gl.useProgram(this.#program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices(cx, cy, half), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(loc.local);
    gl.vertexAttribPointer(loc.local, 2, gl.FLOAT, false, 16, 8);
    gl.uniformMatrix4fv(loc.matrix, false, matrix);
    gl.uniform1f(loc.heading, this.#heading);
    gl.uniform1f(loc.opacity, this.#opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#dataTex);
    gl.uniform1i(loc.data, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#legendTex);
    gl.uniform1i(loc.legend, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // Restore the shared GL state MapLibre does not reset between custom layers, so this overlay never
    // corrupts a sibling layer (the rings, AIS, the vessel) drawn after it.
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(loc.pos);
    gl.disableVertexAttribArray(loc.local);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  dispose(): void {
    const gl = this.#gl;
    gl.deleteBuffer(this.#buffer);
    gl.deleteTexture(this.#dataTex);
    gl.deleteTexture(this.#legendTex);
    gl.deleteProgram(this.#program);
  }
}
