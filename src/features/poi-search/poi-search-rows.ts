import { categoryLabel, type PoiCategory } from '$entities/poi-icons';
import type { LatLon } from '$shared/geo';
import { compareOptionalNumber } from '$shared/lib';
import { rhumbBearingRad, rhumbDistanceMeters } from '$shared/nav';

export interface Poi {
  id: string;
  name: string;
  position: LatLon;
  category: PoiCategory;
  source?: string;
  attribution?: string;
  url?: string;
}

export type PoiSort = 'name' | 'type' | 'distance' | 'bearing';
export type SortDir = 'asc' | 'desc';

export interface PoiRow {
  poi: Poi;
  distanceMeters?: number;
  bearingRad?: number;
}

export function toRows(pois: readonly Poi[], vessel?: LatLon): PoiRow[] {
  return pois.map((poi) => ({
    poi,
    // Rhumb distance to pair with the rhumb bearing below, so the column and the heading describe
    // the same straight-line-on-a-Mercator-chart leg the navigator would actually steer.
    distanceMeters: vessel ? rhumbDistanceMeters(vessel, poi.position) : undefined,
    bearingRad: vessel ? rhumbBearingRad(vessel, poi.position) : undefined,
  }));
}

export function filterRows(rows: readonly PoiRow[], query: string): readonly PoiRow[] {
  const q = query.trim().toLowerCase();
  // Return the input as-is for an empty query: sortRows owns the copy, so a spread here would be a
  // redundant second allocation of the whole list.
  if (q === '') return rows;
  return rows.filter((row) => row.poi.name.toLowerCase().includes(q));
}

export function sortRows(rows: readonly PoiRow[], key: PoiSort, dir: SortDir): PoiRow[] {
  const sorted = [...rows];
  const sign = dir === 'asc' ? 1 : -1;
  if (key === 'name') {
    sorted.sort((a, b) => sign * a.poi.name.localeCompare(b.poi.name));
  } else if (key === 'type') {
    sorted.sort(
      (a, b) => sign * categoryLabel(a.poi.category).localeCompare(categoryLabel(b.poi.category)),
    );
  } else if (key === 'distance') {
    sorted.sort((a, b) => compareOptionalNumber(a.distanceMeters, b.distanceMeters, dir));
  } else {
    sorted.sort((a, b) => compareOptionalNumber(a.bearingRad, b.bearingRad, dir));
  }
  return sorted;
}

export function defaultSort(hasFix: boolean): { key: PoiSort; dir: SortDir } {
  return hasFix ? { key: 'distance', dir: 'asc' } : { key: 'name', dir: 'asc' };
}
