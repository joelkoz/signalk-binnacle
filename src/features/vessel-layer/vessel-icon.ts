import { type Rgba, rasterIcon } from '$shared/map';

export const VESSEL_ICON_ID = 'binnacle-vessel';
const SIZE = 32;

// A filled triangle pointing up (north at 0 rotation), colored per theme.
export function vesselIconImage(color: Rgba): ImageData {
  return rasterIcon(SIZE, color, (x, y, center) => {
    const halfWidth = y / 2.4;
    return y > 3 && Math.abs(x - center) <= halfWidth;
  });
}
