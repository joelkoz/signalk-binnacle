// The default layer selection for a new offline area: the chart that actually covers the box plus the
// essentials, with specialist and facet layers left off so a novice gets a usable area without
// touching the source list. Coverage is already region-correct (the registry bounds are tight), so no
// US-versus-EU inference is needed here.

import type { ChartSource } from 'signalk-chart-sources';
import { isFacet } from './source-summary.js';

// Specialist layers a typical recreational boater does not need by default: the heavy second US depth
// layer, the coarse worldwide bathymetry, the boundary lines, and the protected-area zones. Facets
// (quality and uncertainty children) are excluded separately by isFacet.
const SPECIALIST = new Set([
  'depth-bluetopo',
  'depth-gebco',
  'bound-eez',
  'bound-12nm',
  'mpa-emodnet',
  'mpa-noaa',
]);

/** The minimal sensible default for a new area: every covering source that is neither a facet nor a
 * specialist, which leaves the covering primary chart (NOAA ENC or EMODnet), the seamarks, and the
 * base map. Returns ids in covering order. */
export function defaultSelection(covering: ChartSource[]): string[] {
  return covering.filter((s) => !isFacet(s) && !SPECIALIST.has(s.id)).map((s) => s.id);
}
