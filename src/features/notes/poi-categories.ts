// Re-export from entities so existing internal imports continue to work unchanged.
export type { PoiCategory, PoiType } from '$entities/poi-icons';
export {
  categoryForSkIcon,
  categoryLabel,
  categoryRank,
  POI_CATEGORIES,
  poiCategoryForType,
  poiIconId,
} from '$entities/poi-icons';
