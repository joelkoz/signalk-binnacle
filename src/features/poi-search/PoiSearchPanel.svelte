<script lang="ts">
import { categoryLabel } from '$entities/poi-icons';
import type { UnitsStore } from '$entities/units';
import type { OwnVessel } from '$entities/vessel';
import { formatBearingOr, formatMetersOrNm } from '$shared/lib';
import { SlideOver } from '$shared/ui';
import {
  defaultSort,
  filterRows,
  type Poi,
  type PoiSort,
  type SortDir,
  sortRows,
  toRows,
} from './poi-search-rows';

interface Props {
  pois: readonly Poi[];
  vessel: OwnVessel;
  units: UnitsStore;
  selectedId?: string;
  onSelect: (poi: Poi) => void;
  onClose: () => void;
  onBack?: () => void;
}

const { pois, vessel, units, selectedId, onSelect, onClose, onBack }: Props = $props();

let query = $state('');
// Seeded once at mount: sorts by distance when the vessel has a fix, by name otherwise.
// svelte-ignore state_referenced_locally
let sortState = $state<{ key: PoiSort; dir: SortDir }>(defaultSort(vessel.position !== undefined));

const rows = $derived(
  sortRows(filterRows(toRows(pois, vessel.position), query), sortState.key, sortState.dir),
);

const subtitle = $derived(
  rows.length === pois.length
    ? `${pois.length} in view`
    : `${rows.length} of ${pois.length} in view`,
);

const COLUMNS: { key: PoiSort; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'distance', label: 'Distance' },
  { key: 'bearing', label: 'Bearing' },
];

function toggleSort(key: PoiSort): void {
  sortState =
    sortState.key === key
      ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' };
}

function ariaSort(key: PoiSort): 'ascending' | 'descending' | 'none' {
  if (sortState.key !== key) return 'none';
  return sortState.dir === 'asc' ? 'ascending' : 'descending';
}
</script>

<SlideOver title="POI search" {subtitle} {onClose} {onBack}>
  <section class="poi-search">
    <input
      class="input search-input"
      type="search"
      placeholder="Filter by name"
      aria-label="Filter POIs by name"
      bind:value={query}
    >
    {#if rows.length === 0}
      <p class="muted-note" role="status">
        {pois.length === 0 ? 'No POIs in this view. Pan or zoom the chart.' : 'No matches.'}
      </p>
    {:else}
      <table class="poi-table">
        <thead>
          <tr>
            {#each COLUMNS as col (col.key)}
              <th scope="col" aria-sort={ariaSort(col.key)}>
                <button
                  type="button"
                  class="col-sort"
                  class:is-on={sortState.key === col.key}
                  onclick={() => toggleSort(col.key)}
                >
                  {col.label}
                </button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.poi.id)}
            <tr class:selected={row.poi.id === selectedId}>
              <td class="name-cell">
                <button type="button" class="row-name" onclick={() => onSelect(row.poi)}>
                  {row.poi.name}
                </button>
              </td>
              <td>{categoryLabel(row.poi.category)}</td>
              <td class="num">{formatMetersOrNm(row.distanceMeters, units.mode)}</td>
              <td class="num">{formatBearingOr(row.bearingRad)}&deg;T</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</SlideOver>

<style>
.poi-search {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
/* Composes the shared .input primitive; only the full-panel width is local. */
.search-input {
  inline-size: 100%;
}
.poi-table {
  inline-size: 100%;
  border-collapse: collapse;
}
.poi-table th {
  text-align: start;
  padding: 0;
}
.col-sort {
  inline-size: 100%;
  min-block-size: var(--control-size);
  text-align: start;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-muted);
  background: none;
  border: none;
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
}
.col-sort.is-on {
  color: var(--accent);
}
.poi-table td {
  border-block-start: 1px solid var(--border);
  padding: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-sm);
  white-space: nowrap;
}
.poi-table td.name-cell {
  padding: 0;
  color: var(--text);
}
.row-name {
  inline-size: 100%;
  min-block-size: var(--control-size);
  text-align: start;
  font: inherit;
  color: var(--text);
  background: none;
  border: none;
  padding: var(--space-2);
  cursor: pointer;
}
.row-name:hover {
  color: var(--accent);
}
tr.selected {
  background: var(--surface-raised);
}
tr.selected .row-name {
  color: var(--accent);
  font-weight: 600;
}
</style>
