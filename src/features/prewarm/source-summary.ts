// Plain-language grouping and summary of the chart sources for the offline-charts builder. The
// registry ChartSource (id, title, bounds) carries no category or parent, so this joins the covering
// sources to the webapp's augmented catalog (assembled once from the feature source modules) to group
// them under the same plain Layers-panel categories and to hide facet rows. No third vocabulary: the
// category titles come from layer-category.

import type { ChartSource } from 'signalk-chart-sources';
import { BOUNDARY_SOURCES } from '$features/boundaries-overlay';
import { STREAMING_CHART_SOURCES } from '$features/depth-charts';
import { CATEGORY_ORDER, CATEGORY_TITLES } from '$features/layers-panel';
import { MPA_SOURCES } from '$features/mpa-overlays';
import { SEAMARK_SOURCES } from '$features/seamark-overlay';

interface SourceMeta {
  category: string;
  parent?: string;
  region?: string;
}

// One by-id catalog assembled from every augmented source module plus the base map. The depth sources
// declare no category (they draw in the bathymetry band), so they default to the charts category, the
// same fallback layer-category applies.
const SOURCE_MODULES = [STREAMING_CHART_SOURCES, MPA_SOURCES, BOUNDARY_SOURCES, SEAMARK_SOURCES];
const META: Record<string, SourceMeta> = (() => {
  const map: Record<string, SourceMeta> = {};
  for (const module of SOURCE_MODULES) {
    for (const s of module) {
      map[s.id] = { category: s.category ?? 'charts', parent: s.parent, region: s.region };
    }
  }
  map.basemap = { category: 'charts', region: 'Global' };
  return map;
})();

/** The category metadata for a source id, if it is known to the catalog. */
export function sourceMeta(id: string): SourceMeta | undefined {
  return META[id];
}

/** A facet is a child of another overlay (ZOC, uncertainty, Natura 2000); it is hidden from the builder. */
export function isFacet(source: { id: string }): boolean {
  return META[source.id]?.parent !== undefined;
}

export interface SourceGroup {
  category: string;
  title: string;
  sources: ChartSource[];
}

/** Group the covering sources by their plain Layers-panel category, in category order, dropping facets. */
export function coveringGroups(covering: ChartSource[]): SourceGroup[] {
  const byCategory = new Map<string, ChartSource[]>();
  for (const source of covering) {
    if (isFacet(source)) continue;
    const category = META[source.id]?.category ?? 'charts';
    const list = byCategory.get(category) ?? [];
    list.push(source);
    byCategory.set(category, list);
  }
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
    category: c,
    title: CATEGORY_TITLES[c] ?? c,
    sources: byCategory.get(c) ?? [],
  }));
}

// The plain noun each source contributes to the "what is included" sentence. Several depth sources map
// to the same noun, deliberately de-duped in the summary.
const PLAIN_NOUN: Record<string, string> = {
  'depth-noaa-enc': 'the nautical chart',
  'depth-emodnet': 'depth',
  'depth-bluetopo': 'depth',
  'depth-gebco': 'depth',
  seamark: 'navigation marks',
  basemap: 'the base map',
  'bound-eez': 'boundaries',
  'bound-12nm': 'boundaries',
  'mpa-emodnet': 'protected areas',
  'mpa-noaa': 'protected areas',
};

function joinPlain(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** A plain sentence describing the selected sources, for example "The nautical chart, depth, and the
 * base map." Facets are ignored; nouns are de-duped in source order. */
export function includedSummary(selected: ChartSource[]): string {
  const nouns: string[] = [];
  for (const source of selected) {
    if (isFacet(source)) continue;
    const noun = PLAIN_NOUN[source.id];
    if (noun !== undefined && !nouns.includes(noun)) nouns.push(noun);
  }
  if (nouns.length === 0) return 'Nothing yet. Pick at least one chart layer below.';
  const sentence = joinPlain(nouns);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
