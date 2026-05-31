export const AIS_ICON_ID = 'binnacle-ais';
const SIZE = 28;

let cached: ImageData | undefined;

// A hollow amber triangle for AIS targets, distinct from the filled own-vessel
// icon. Built once and reused across re-registration.
export function aisIconImage(): ImageData {
  if (cached) return cached;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const cx = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const t = y / SIZE;
      const halfWidth = (t * SIZE) / 2.6;
      const dx = Math.abs(x - cx);
      const onSide = y > 3 && Math.abs(dx - halfWidth) <= 1.4 && dx <= halfWidth + 1.4;
      const onBase = y >= SIZE - 3 && dx <= halfWidth;
      if (onSide || onBase) {
        const i = (y * SIZE + x) * 4;
        data[i] = 0xe6;
        data[i + 1] = 0xc1;
        data[i + 2] = 0x4e;
        data[i + 3] = 0xff;
      }
    }
  }
  cached = new ImageData(data, SIZE, SIZE);
  return cached;
}
