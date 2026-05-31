import { rasterIcon } from '$shared/map';

export const AIS_ICON_ID = 'binnacle-ais';
const SIZE = 28;

let cached: ImageData | undefined;

// A hollow amber triangle for AIS targets, distinct from the filled own-vessel
// icon. Built once and reused across re-registration.
export function aisIconImage(): ImageData {
  if (cached) return cached;
  cached = rasterIcon(SIZE, { r: 0xe6, g: 0xc1, b: 0x4e, a: 0xff }, (x, y, center) => {
    const halfWidth = ((y / SIZE) * SIZE) / 2.6;
    const dx = Math.abs(x - center);
    const onSide = y > 3 && Math.abs(dx - halfWidth) <= 1.4 && dx <= halfWidth + 1.4;
    const onBase = y >= SIZE - 3 && dx <= halfWidth;
    return onSide || onBase;
  });
  return cached;
}
