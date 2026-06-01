import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapThemePaint } from '$shared/map';
import { POI_CATEGORIES, type PoiCategory, poiIconId } from './poi-categories';

// Per-category glyphs. Anchorage, marina, hazard, structure, and generic are Lucide
// glyphs (anchor, sailboat, triangle-alert, landmark, map-pin) per the spec's chosen
// app icon family; navaid is a custom beacon (a diamond daymark on a post) in the same
// 24x24 / 2px stroke weight, the spec's sanctioned "one-off custom SVG". Authentic S-52
// buoy and light symbols replace navaid when the chart-symbol atlas lands.
const GLYPHS: Record<PoiCategory, string> = {
  anchorage:
    '<path d="M12 6v16"/><path d="m19 13 2-1a9 9 0 0 1-18 0l2 1"/><path d="M9 11h6"/><circle cx="12" cy="4" r="2"/>',
  marina:
    '<path d="M10 2v15"/><path d="M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4z"/><path d="M9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z"/>',
  hazard:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  navaid: '<path d="M12 2 16 7 12 12 8 7Z"/><path d="M12 12v9"/><path d="M8 21h8"/>',
  structure:
    '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/>',
  generic:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};

// Hazards take the alarm hue, navaids the caution hue, the rest the POI hue.
function fillColor(category: PoiCategory, paint: MapThemePaint): string {
  if (category === 'hazard') return paint.danger;
  if (category === 'navaid') return paint.warning;
  return paint.note;
}

function markerSvg(category: PoiCategory, paint: MapThemePaint): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">',
    `<circle cx="15" cy="15" r="14" fill="${fillColor(category, paint)}"/>`,
    `<g transform="translate(3,3)" fill="none" stroke="${paint.markerGlyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    GLYPHS[category],
    '</g></svg>',
  ].join('');
}

const ICON_PX = 60; // rendered at 2x for crispness; added with pixelRatio 2 -> 30 CSS px

// Rasterize the SVG through an Image and a canvas. createImageBitmap does not reliably
// decode SVG blobs across browsers, but Image + drawImage does. Browser only: the node
// test environment has no document, so icons are simply not registered there (the source
// and layer still install).
async function rasterize(svg: string): Promise<ImageData | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image(ICON_PX, ICON_PX);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, ICON_PX, ICON_PX);
    return ctx.getImageData(0, 0, ICON_PX, ICON_PX);
  } catch {
    return null;
  }
}

// Register (or recolor, on a theme change) the marker icon for every category. Never
// throws: an icon that fails to rasterize is skipped so it cannot break overlay setup.
export async function registerPoiIcons(map: MapLibreMap, paint: MapThemePaint): Promise<void> {
  await Promise.all(
    POI_CATEGORIES.map(async (category) => {
      const image = await rasterize(markerSvg(category, paint));
      if (!image) return;
      const id = poiIconId(category);
      if (map.hasImage(id)) map.updateImage(id, image);
      else map.addImage(id, image, { pixelRatio: 2 });
    }),
  );
}
