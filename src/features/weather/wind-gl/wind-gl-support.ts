import { createProgram, type GL } from './gl-resources';
import { DRAW_FRAG, DRAW_VERT, QUAD_VERT, UPDATE_FRAG } from './shaders';

// A lightweight probe: can this environment compile the wind programs on a throwaway context? Used
// by the overlay to choose particles vs the arrow fallback before touching the map. The result is
// fixed for the page (the GPU and driver do not change), so it is memoized: the probe allocates a
// canvas, a GL context, and two compiled programs, and that should happen at most once per load.
let windGlSupport: boolean | undefined;
export function supportsWindGl(): boolean {
  if (windGlSupport !== undefined) return windGlSupport;
  let gl: GL | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as GL | null;
    if (!gl) {
      windGlSupport = false;
      return windGlSupport;
    }
    createProgram(gl, QUAD_VERT, UPDATE_FRAG);
    createProgram(gl, DRAW_VERT, DRAW_FRAG);
    windGlSupport = true;
  } catch {
    windGlSupport = false;
  } finally {
    // Browsers cap live WebGL contexts per page; release the probe's instead of waiting for GC.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return windGlSupport;
}
