<script lang="ts">
import { categoryLabel, poiInlineIconSvg } from '$entities/poi-icons';
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
  // Choose a result: rings its marker on the chart and opens its detail. Never moves the map.
  onSelect: (poi: Poi) => void;
  // Preview a result on the chart while the pointer or keyboard focus is on its row, and clear with
  // undefined on leave. Drives the transient chart ring.
  onHover: (poi: Poi | undefined) => void;
  onClose: () => void;
  onBack?: () => void;
}

const { pois, vessel, units, onSelect, onHover, onClose, onBack }: Props = $props();

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

const SORTS: { key: PoiSort; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'distance', label: 'Distance' },
  { key: 'bearing', label: 'Bearing' },
];

// Same key flips the direction; a new key starts ascending.
function toggleSort(key: PoiSort): void {
  sortState =
    sortState.key === key
      ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' };
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
    <div class="sort">
      <span class="caps-label">Sort by</span>
      <div class="segmented" role="group" aria-label="Sort POIs by">
        {#each SORTS as option (option.key)}
          <button
            type="button"
            class="btn"
            class:is-on={sortState.key === option.key}
            aria-pressed={sortState.key === option.key}
            onclick={() => toggleSort(option.key)}
          >
            {option.label}
            {#if sortState.key === option.key}
              <span aria-hidden="true">{sortState.dir === 'asc' ? '↑' : '↓'}</span>
              <span class="visually-hidden">
                {sortState.dir === 'asc' ? 'ascending' : 'descending'}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
    {#if rows.length === 0}
      <p class="muted-note" role="status">
        {pois.length === 0 ? 'No POIs in this view. Pan or zoom the chart.' : 'No matches.'}
      </p>
    {:else}
      <ul class="poi-list">
        {#each rows as row (row.poi.id)}
          <li>
            <button
              type="button"
              class="poi-row"
              onclick={() => onSelect(row.poi)}
              onmouseenter={() => onHover(row.poi)}
              onmouseleave={() => onHover(undefined)}
              onfocus={() => onHover(row.poi)}
              onblur={() => onHover(undefined)}
            >
              <span class="poi-head">
                <span class="poi-cat" title={categoryLabel(row.poi.category)}>
                  <!-- The category SVG is a static literal from a fixed enum, never external input. -->
                  {@html poiInlineIconSvg(row.poi.category)}
                  <span class="visually-hidden">{categoryLabel(row.poi.category)}</span>
                </span>
                <span class="poi-name">{row.poi.name}</span>
              </span>
              <span class="metrics">
                <span class="metric">
                  Dist <b class="num">{formatMetersOrNm(row.distanceMeters, units.mode)}</b>
                </span>
                <span class="metric">
                  Brg <b class="num">{formatBearingOr(row.bearingRad)}</b>&deg;T
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
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
/* The sort label sits above a full-width segmented so all four keys fit the narrow dock; the active
   key shows its direction with an arrow and a visually-hidden word, never color alone. */
.sort {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.sort .segmented {
  inline-size: 100%;
}
.sort .segmented .btn {
  flex: 1;
  gap: var(--space-1);
}
.poi-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
/* Each result is one tappable two-line card: the category icon and full name on top, the mono
   distance and bearing below, so a long name uses the panel width instead of clipping in a column.
   Mirrors the AIS targets list; a candidate to hoist into a shared list primitive. */
.poi-row {
  inline-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font: inherit;
  text-align: start;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.poi-row:hover {
  border-color: var(--accent);
}
.poi-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.poi-cat {
  flex-shrink: 0;
  display: inline-flex;
}
.poi-name {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.metric .num {
  color: var(--text);
}
</style>
