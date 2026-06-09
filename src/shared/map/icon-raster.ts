export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Builds a square RGBA icon by calling `fill` per pixel. `fill` returns true for
// pixels that should take the color. Used to draw the simple vessel and AIS marker
// triangles into ImageData for map.addImage; callers cache the result.
export function rasterIcon(
  size: number,
  color: Rgba,
  fill: (x: number, y: number, center: number) => boolean,
): ImageData {
  return rasterIconColored(size, (x, y, center) => (fill(x, y, center) ? color : null));
}

// Like rasterIcon, but `paint` returns the pixel's color or null for transparent, so a marker can draw
// more than one color (for example a dark halo band outside a colored stroke) in a single pass.
export function rasterIconColored(
  size: number,
  paint: (x: number, y: number, center: number) => Rgba | null,
): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = paint(x, y, center);
      if (!color) continue;
      const i = (y * size + x) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = color.a;
    }
  }
  return new ImageData(data, size, size);
}
