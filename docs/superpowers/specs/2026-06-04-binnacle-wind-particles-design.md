# Binnacle Wind Particles Design

**Status:** Approved (brainstorm complete, 2026-06-04).

**Goal:** Replace the wind layer's stand-in line-arrow render with an animated WebGL
particle field, the glanceable, Windy-like signature layer, in the weather mini-map. It
advects particles through the forecast u/v field, draws them as speed-colored points with
fading trails, and themes for day, dusk, and night-red. The arrow render stays as the
graceful fallback when WebGL is unavailable.

This completes the one weather item deferred from the weather overlay spec
(`2026-06-03-binnacle-weather-overlay-design.md`), which locked wind as "a custom MapLibre
WebGL layer (not deck.gl) for bundle leanness and full theme control" and shipped the
line-arrow layer as the pipeline-first stand-in.

## Locked decisions (from the brainstorm)

- **Renderer:** a custom MapLibre `CustomLayerInterface`, GPU ping-pong particle simulation
  (the earth.nullschool / webgl-wind technique). Not deck.gl (a heavy dependency the weather
  spec rejected for bundle size), not a CPU canvas (too few particles, too much main-thread
  cost on the Pi).
- **Look:** fading trails (the streaming signature), accumulated in a screen-space buffer
  that resets on pan or zoom so trails stay correct on the movable mini-map and re-form when
  the view settles.
- **Fallback:** the existing arrow line layer, not deck.gl. Any WebGL init failure routes to
  arrows under the same overlay contract.
- **Home:** the weather mini-map (`src/widgets/weather-map`), the dedicated, zoom-capped
  weather frame where all weather now lives. The nav chart carries no weather.

## Architecture

One MapLibre custom WebGL layer for the wind particles, registered as the `weather-wind`
overlay in the mini-map's `weather` z-band, in place of the arrow render as the default. It
keeps the same overlay id (`WEATHER_LAYER_IDS.wind`), the same toggle, opacity, theme, and
legend contract, so the `LayerManager`, the Layers UI, and the legend are unchanged. The
particle machinery is encapsulated in the weather feature; nothing outside the slice changes.

The particle simulation is camera-independent: particles live in the forecast grid's
geographic space, and only their projection to the screen changes as the map pans or zooms.
This keeps the math simple and makes trails-on-a-movable-map tractable.

## Components (all inside `src/features/weather`)

- `wind-gl/wind-particles.ts`: a `WindParticles` class that owns the GL programs, the wind
  texture, the color-ramp texture, the ping-pong particle-state textures, and the
  screen/trail framebuffers. Public surface:
  - `constructor(gl, options)`: compiles programs and allocates textures; throws on any GL
    failure so the overlay can fall back.
  - `setWind(field)`: uploads a new wind field texture and its decode metadata (bounds,
    u/v range) when the grid or selected time changes.
  - `setTheme(rampPixels)` and `setOpacity(value)`: update the color ramp texture and the
    opacity uniform.
  - `render(matrix, widthPx, heightPx, moved)`: runs the update pass, the draw-into-trail
    pass, and the blit; clears the trail buffer when `moved` is true.
  - `dispose()`: deletes all GL resources.
  It is map-agnostic: it takes a projection matrix and viewport size, not a MapLibre map.
- `wind-gl/shaders.ts`: the GLSL sources as string constants: a screen quad vertex shader,
  the screen/trail-blit fragment shader, the update (advect) fragment shader, and the
  point-draw vertex and fragment shaders.
- `wind-field-texture.ts` (pure, unit-tested): builds the byte wind texture from the grid's
  `windU`/`windV` at the blended bracket. Returns the `Uint8Array` RGBA pixels (u in R/G or
  packed, v likewise), the grid lon/lat bounds, and the u/v min and max for shader decode.
  Land (NaN) cells encode to a sentinel the update shader treats as "no wind, respawn." The
  rows are north-flipped to match texture coordinates, mirroring `field-rgba.ts`.
- `wind-color-texture.ts` (pure, unit-tested): builds a 256x1 RGBA `Uint8Array` ramp by
  sampling `windColor(speed, theme)` across the speed domain, so the draw shader looks up a
  particle's color by its normalized speed. Rebuilt when the theme changes.
- `wind-overlay.ts` (rewritten): the `weather-wind` `OverlayModule`. `add(ctx)` tries to
  create the custom layer; on any GL failure it falls back to today's arrow line layer.
  `sync(ctx)` rebuilds the wind field texture (and pushes it to the particle sim, or sets the
  arrow source in fallback mode) on grid, time, or theme change. `setVisible`, `setOpacity`,
  and `applyTheme` drive shader uniforms (or the arrow paint in fallback mode).

The existing `wind-arrows.ts` and `windColorExpression` stay, used only by the fallback path.
`windColor` is reused by both the ramp texture and the arrow expression.

## Data and animation flow

1. The mini-map's loader fills `WeatherStore.grid` with `windU`/`windV` (already happening).
2. `wind-overlay.sync`, dirty-checked on `grid`, `selectedTime`, and theme, rebuilds the wind
   field texture (`wind-field-texture`) and, on theme change, the color ramp
   (`wind-color-texture`), and hands them to the `WindParticles` instance.
3. The custom layer's `render(gl, matrix)` runs each MapLibre frame:
   - **Update pass:** for each particle, read its position from the state texture, sample the
     wind texture at that position, advance the position by the decoded `(u, v)` scaled by a
     speed factor and the frame delta, apply a small pseudo-random drop so particles respawn
     to avoid clumping and to reseed off-grid or land cells, and write the new position to the
     other state texture (ping-pong).
   - **Draw pass:** render the particles as `gl.POINTS` into the trail framebuffer. The
     previous trail frame is drawn first at a fade factor below 1 so old trails decay; the new
     points draw on top. Each point's color comes from the ramp texture by its speed.
   - **Blit pass:** draw the trail framebuffer to the screen at the layer opacity.
   - Call `map.triggerRepaint()` to schedule the next frame while the layer is visible.
4. `sync` and the animation are independent: `sync` only refreshes textures on data change;
   the animation runs in the MapLibre render loop via `triggerRepaint`.

## Coordinate handling

Particle positions are normalized to the grid bounds in `[0, 1]^2`. The update pass works
entirely in this normalized geographic space, so it is independent of the camera. The draw
pass converts each particle's normalized position to lon/lat by lerping the grid bounds, then
to a mercator `[0, 1]` coordinate (the same projection MapLibre's matrix expects), then
multiplies by the layer `matrix` to get clip space. Pan and zoom therefore only reproject the
particles; they never move in the world. The wind texture and the bounds come from the same
grid, so sampling and drawing share one coordinate frame.

## Trails on a movable map

The trail accumulation buffer is screen-space, so it is only valid for one camera pose. The
custom layer keeps the last projection matrix and compares it each frame; when it changes
(pan, zoom, or rotate), it clears the trail buffer that frame, so stale trails never smear,
and re-accumulates while the view is settled. Weather viewing is mostly stationary, so the
streaming look is present almost all the time, and a move just resets it cleanly.

## Theming

The color ramp texture carries the per-theme palette from the existing `windColor`: a marine
teal-green-yellow-orange-red ramp for day and dusk, and a deep red-on-black ramp for
night-red (no blue, brightness rising with speed, brightest pixel kept low to protect dark
adaptation). The layer opacity and a trail-fade factor are uniforms. `applyTheme` rebuilds the
ramp texture; no other recolor is needed because the particles are drawn, not styled.

## Performance (Raspberry Pi class)

The particle count is capped via the state texture size, default 128x64 = 8192 particles; the
update pass is one small fragment draw and the draw pass is 8192 points, both cheap on the
Pi's GPU, and the mini-map is small. The layer requests repaint only while visible, so the
Wind layer toggled off does no per-frame work. The layer lives in the mini-map and is
destroyed with it when the panel closes, so there is never a background animation. The
particle count is a single constant, easy to lower later if a night or low-power profile
wants it.

## Fallback and error handling

All GL setup (context features, program compilation, texture and framebuffer allocation) runs
in a try/catch inside `add(ctx)`. On any failure the overlay creates the existing arrow line
layer instead, logs one `console.warn`, and serves the same id, toggle, opacity, theme, and
legend, so nothing downstream knows the difference. The custom layer's `render` guards against
a lost context. Particle state is byte-encoded (the webgl-wind approach, two bytes per
coordinate) so the layer works on both WebGL1 and WebGL2 contexts that MapLibre may provide,
without requiring float-texture extensions.

## Testing

- Unit tests (pure, headless): `wind-field-texture` (u/v encode and decode range, bounds,
  NaN-to-sentinel, north-flip), `wind-color-texture` (ramp sampling per theme, endpoints), and
  the normalized-to-lon/lat coordinate helper.
- The GL passes (update, draw, trails, projection) are verified live on the boat over HTTPS in
  all three themes, per the weather spec's rule that WebGL particle rendering is verified live,
  not unit-tested. Live checks: particles stream along the wind, faster wind reads hotter,
  trails fade and reset cleanly on pan and zoom, night-red shows red on black with no blue, the
  layer toggles and fades from the panel, and forcing the fallback (simulated GL failure) shows
  the arrows with the same toggle and legend.

## File structure

- New: `src/features/weather/wind-gl/wind-particles.ts`,
  `src/features/weather/wind-gl/shaders.ts`,
  `src/features/weather/wind-field-texture.ts` (+ test),
  `src/features/weather/wind-color-texture.ts` (+ test),
  and a coordinate helper test if the helper warrants its own module.
- Modified: `src/features/weather/wind-overlay.ts` (custom layer plus arrow fallback). The
  weather feature's public API (`index.ts`) is unchanged: `createWindOverlay` stays the
  factory. `wind-arrows.ts` and `windColorExpression` stay for the fallback.
- Unchanged: `WeatherMap`, `App`, the `LayerManager`, the legend, the loader.

## Build order

1. `wind-field-texture.ts` and `wind-color-texture.ts` with their unit tests (pure, TDD).
2. `wind-gl/shaders.ts` and `wind-gl/wind-particles.ts` (the GL engine, map-agnostic).
3. Rewrite `wind-overlay.ts` to host the custom layer with the arrow fallback.
4. Gate (biome, svelte-check, dependency-cruiser, vitest, build), then live-verify on the
   boat in all three themes, then the `/cleanup` gate.

## Risks

- The custom WebGL particle layer is the riskiest build (per the weather spec). The arrow
  fallback bounds the downside: if the GL path cannot be made solid, wind still renders.
- Trail correctness on pan and zoom depends on the clear-on-move detection; if smearing
  appears, the reset condition is the place to fix, and crisp dots (no trail accumulation) is
  the always-correct degradation within the same layer.
- The grid is coarse (about 0.25 degrees) and capped to the mini-map's zoom 7, so particle
  detail is bounded by the data, which is the intended honest behavior.
