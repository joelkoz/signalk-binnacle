import { type Rgba, rasterIconColored } from '$shared/map';

// Distinct from the AIS source id ('binnacle-ais'): this is the map image id.
export const AIS_ICON_ID = 'binnacle-ais-icon';
const SIZE = 28;
// The triangle half-width at row y is y / this divisor, which sets the apex angle: a larger divisor
// draws a narrower, taller-looking triangle.
const HALF_WIDTH_DIVISOR = 2.6;
// A dark halo just outside the colored stroke, so the thin hollow triangle holds on same-luminance day
// water. Fixed dark like the route casing: it lifts the marker on the light chart and is invisible on
// the dark dusk and night-red maps, where the colored stroke carries on its own.
const HALO: Rgba = { r: 0, g: 0, b: 0, a: 150 };

// A hollow triangle for AIS targets, distinct from the filled own-vessel icon, colored per theme with
// a dark halo for contrast.
export function aisIconImage(color: Rgba): ImageData {
  return rasterIconColored(SIZE, (x, y, center) => {
    const halfWidth = y / HALF_WIDTH_DIVISOR;
    const dx = Math.abs(x - center);
    const onSide = y > 3 && Math.abs(dx - halfWidth) <= 1.4 && dx <= halfWidth + 1.4;
    const onBase = y >= SIZE - 3 && dx <= halfWidth;
    if (onSide || onBase) return color;
    // One pixel wider on each edge of the stroke: the halo band.
    const onSideHalo = y > 2 && Math.abs(dx - halfWidth) <= 2.4 && dx <= halfWidth + 2.4;
    const onBaseHalo = y >= SIZE - 4 && dx <= halfWidth + 1;
    return onSideHalo || onBaseHalo ? HALO : null;
  });
}
