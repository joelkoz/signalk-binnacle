export const VESSEL_ICON_ID = 'binnacle-vessel';
const SIZE = 32;

let cached: ImageData | undefined;

// A filled triangle pointing up (north at 0 rotation), drawn into ImageData so
// it can be registered with map.addImage and rotated by icon-rotate. The result
// is constant, so it is built once and reused across re-registration.
export function vesselIconImage(): ImageData {
  if (cached) return cached;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const cx = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const t = y / SIZE;
      const halfWidth = (t * SIZE) / 2.4;
      const inside = y > 3 && Math.abs(x - cx) <= halfWidth;
      if (inside) {
        const i = (y * SIZE + x) * 4;
        data[i] = 0x7f;
        data[i + 1] = 0xb7;
        data[i + 2] = 0xe6;
        data[i + 3] = 0xff;
      }
    }
  }
  cached = new ImageData(data, SIZE, SIZE);
  return cached;
}
