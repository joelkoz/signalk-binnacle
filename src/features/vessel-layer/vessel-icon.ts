import { rasterIcon } from '$shared/map';

export const VESSEL_ICON_ID = 'binnacle-vessel';
const SIZE = 32;

let cached: ImageData | undefined;

// A filled triangle pointing up (north at 0 rotation), built once and reused
// across re-registration.
export function vesselIconImage(): ImageData {
  if (cached) return cached;
  cached = rasterIcon(SIZE, { r: 0x7f, g: 0xb7, b: 0xe6, a: 0xff }, (x, y, center) => {
    const halfWidth = ((y / SIZE) * SIZE) / 2.4;
    return y > 3 && Math.abs(x - center) <= halfWidth;
  });
  return cached;
}
