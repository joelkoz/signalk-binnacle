// Crow's Nest (and other notes providers) tag each note with a Freeboard `skIcon`.
// There are ~33 of them; Binnacle groups them into a handful of marker categories, each
// with its own glyph and themed color. A category is the single source for both.
export type PoiCategory = 'anchorage' | 'marina' | 'hazard' | 'navaid' | 'structure' | 'generic';

export const POI_CATEGORIES: readonly PoiCategory[] = [
  'anchorage',
  'marina',
  'hazard',
  'navaid',
  'structure',
  'generic',
];

const SKICON_CATEGORY: Record<string, PoiCategory> = {
  anchorage: 'anchorage',
  anchor_berth: 'anchorage',
  mooring: 'anchorage',
  marina: 'marina',
  harbour: 'marina',
  hazard: 'hazard',
  obstruction: 'hazard',
  rock: 'hazard',
  wreck: 'hazard',
  beacon_isolated_danger: 'hazard',
  buoy_isolated_danger: 'hazard',
  beacon_cardinal: 'navaid',
  beacon_lateral: 'navaid',
  beacon_safe_water: 'navaid',
  beacon_special_purpose: 'navaid',
  buoy_cardinal: 'navaid',
  buoy_lateral: 'navaid',
  buoy_safe_water: 'navaid',
  buoy_special_purpose: 'navaid',
  light_float: 'navaid',
  light_major: 'navaid',
  light_minor: 'navaid',
  light_vessel: 'navaid',
  bridge: 'structure',
  dam: 'structure',
  lock: 'structure',
  lock_basin: 'structure',
  ferry: 'structure',
  boatramp: 'structure',
};

const CATEGORY_LABEL: Record<PoiCategory, string> = {
  anchorage: 'Anchorage',
  marina: 'Marina',
  hazard: 'Hazard',
  navaid: 'Navigation aid',
  structure: 'Structure',
  generic: 'Point of interest',
};

export function categoryForSkIcon(skIcon: string | undefined): PoiCategory {
  if (!skIcon) return 'generic';
  return SKICON_CATEGORY[skIcon] ?? 'generic';
}

export function categoryLabel(category: PoiCategory): string {
  return CATEGORY_LABEL[category];
}

export function poiIconId(category: PoiCategory): string {
  return `binnacle-poi-${category}`;
}
