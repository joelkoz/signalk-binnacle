import type { LayerListItem } from '$shared/map';

export interface LayerCategory {
  id: string;
  title: string;
}

// The single source of truth for the Layers-panel categories: their order (top of the map first),
// their titles, and their first-run open state. CATEGORY_ORDER and CATEGORY_DEFAULT_OPEN derive from
// this so the id list never drifts. The order must match the map z-order (the band order in Z_ORDER
// and the registration order in ChartCanvas) so the panel reads the same as the stack and a
// drag-to-reorder lands where the navigator drops it.
const CATEGORIES = [
  { id: 'mine', title: 'My routes and tracks', defaultOpen: true },
  { id: 'live', title: 'Traffic and live data', defaultOpen: true },
  { id: 'nav-aids', title: 'Navigation aids', defaultOpen: false },
  { id: 'areas', title: 'Areas and boundaries', defaultOpen: false },
  { id: 'ocean', title: 'Ocean conditions', defaultOpen: false },
  { id: 'charts', title: 'Charts and depth', defaultOpen: false },
] as const;

const KNOWN = new Set<string>(CATEGORIES.map((c) => c.id));
const TITLE = new Map<string, string>(CATEGORIES.map((c) => [c.id, c.title]));

export const CATEGORY_ORDER = CATEGORIES.map((c) => c.id);
export const CATEGORY_DEFAULT_OPEN: Record<string, boolean> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.defaultOpen]),
);

// An overlay's declared category wins; otherwise the band picks a default (charts for the chart and
// depth bands, ocean for the weather band, live for traffic, and the navigator's own data for the
// rest, which catches routes, notes, and the track). An unknown declared category also falls to the
// own-data bucket, so a typo never drops a layer out of the panel.
function resolveId(item: LayerListItem): string {
  if (item.category && KNOWN.has(item.category)) return item.category;
  if (item.band === 'basemap' || item.band === 'bathymetry') return 'charts';
  if (item.band === 'weather') return 'ocean';
  if (item.band === 'traffic') return 'live';
  return 'mine';
}

export function layerCategory(item: LayerListItem): LayerCategory {
  const id = resolveId(item);
  return { id, title: TITLE.get(id) ?? '' };
}
