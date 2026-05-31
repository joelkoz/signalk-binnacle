import { type Rgba, rasterIcon } from '$shared/map';

export const AIS_ICON_ID = 'binnacle-ais';
const SIZE = 28;

// A hollow triangle for AIS targets, distinct from the filled own-vessel icon,
// colored per theme.
export function aisIconImage(color: Rgba): ImageData {
  return rasterIcon(SIZE, color, (x, y, center) => {
    const halfWidth = ((y / SIZE) * SIZE) / 2.6;
    const dx = Math.abs(x - center);
    const onSide = y > 3 && Math.abs(dx - halfWidth) <= 1.4 && dx <= halfWidth + 1.4;
    const onBase = y >= SIZE - 3 && dx <= halfWidth;
    return onSide || onBase;
  });
}
