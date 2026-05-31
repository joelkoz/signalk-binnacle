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
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!fill(x, y, center)) continue;
      const i = (y * size + x) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = color.a;
    }
  }
  return new ImageData(data, size, size);
}
