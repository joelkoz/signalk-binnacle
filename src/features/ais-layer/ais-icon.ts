import { type Rgba, rasterIcon } from '$shared/map';

// Distinct from the AIS source id ('binnacle-ais'): this is the map image id.
export const AIS_ICON_ID = 'binnacle-ais-icon';
const SIZE = 28;
// The triangle half-width at row y is y / this divisor, which sets the apex angle: a larger divisor
// draws a narrower, taller-looking triangle.
const HALF_WIDTH_DIVISOR = 2.6;

// A hollow triangle for AIS targets, distinct from the filled own-vessel icon,
// colored per theme.
export function aisIconImage(color: Rgba): ImageData {
  return rasterIcon(SIZE, color, (x, y, center) => {
    const halfWidth = y / HALF_WIDTH_DIVISOR;
    const dx = Math.abs(x - center);
    const onSide = y > 3 && Math.abs(dx - halfWidth) <= 1.4 && dx <= halfWidth + 1.4;
    const onBase = y >= SIZE - 3 && dx <= halfWidth;
    return onSide || onBase;
  });
}
