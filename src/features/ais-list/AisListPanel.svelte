<script lang="ts">
import type { AisTargets } from '$entities/ais';
import type { CollisionAssessment } from '$entities/collision';
import type { UnitsStore } from '$entities/units';
import type { OwnVessel } from '$entities/vessel';
import { type LatLon, quantizeLatLonKey } from '$shared/geo';
import {
  formatBearingOr,
  formatKnotsOr,
  formatMetersOrNm,
  formatNm,
  formatTcpaMin,
} from '$shared/lib';
import { SlideOver } from '$shared/ui';
import { type AisSort, buildAisRows } from './ais-rows';

interface Props {
  aisTargets: AisTargets;
  vessel: OwnVessel;
  collision: CollisionAssessment;
  units: UnitsStore;
  // Fly the chart to a tapped target.
  onLocate: (position: LatLon) => void;
  onClose: () => void;
  onBack?: () => void;
}

const { aisTargets, vessel, collision, units, onLocate, onClose, onBack }: Props = $props();

let sort = $state<AisSort>('range');

const SORTS: { id: AisSort; label: string }[] = [
  { id: 'range', label: 'Range' },
  { id: 'cpa', label: 'CPA' },
  { id: 'name', label: 'Name' },
];

// The own fix is quantized to about 110 m before it reaches buildAisRows, so a 1 Hz GPS jitter does
// not recompute the range and bearing of every target on every tick; the list does not need finer.
// The key is a string so the derived halts when the rounded cell is unchanged, then parsedOwn (and
// the rows below) only recompute when the cell, the traffic, the risks, or the sort actually change.
const ownCellKey = $derived(vessel.position ? quantizeLatLonKey(vessel.position) : '');
const parsedOwn = $derived<LatLon | undefined>(
  ownCellKey
    ? (() => {
        const [latitude, longitude] = ownCellKey.split(',').map(Number);
        return { latitude, longitude };
      })()
    : undefined,
);
// list() reads aisVersion, so the rows re-derive as traffic moves; the own cell re-sorts by range.
const rows = $derived(
  buildAisRows(aisTargets.list(), parsedOwn, collision.assessment.contacts, sort),
);
</script>

<SlideOver title="AIS targets" subtitle="{rows.length} tracked" {onClose} {onBack}>
  <section class="ais-list">
    <div class="sort">
      <span class="caps-label">Sort by</span>
      <div class="segmented" role="group" aria-label="Sort targets by">
        {#each SORTS as option (option.id)}
          <button
            type="button"
            class="btn"
            class:is-on={sort === option.id}
            aria-pressed={sort === option.id}
            onclick={() => (sort = option.id)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>
    {#if rows.length === 0}
      <p class="muted-note">No AIS targets.</p>
    {:else}
      <ul class="targets">
        {#each rows as row (row.id)}
          <li>
            <button
              type="button"
              class="target"
              title="Show {row.label} on the chart"
              onclick={() => onLocate(row.position)}
            >
              <span
                class="name"
                class:sev-danger={row.severity === 'danger'}
                class:sev-warning={row.severity === 'warning'}
              >
                {row.label}
              </span>
              <span class="metrics">
                <span class="metric">
                  Range <b class="num">{formatMetersOrNm(row.rangeMeters, units.mode)}</b>
                </span>
                <span class="metric"
                  >Brg <b class="num">{formatBearingOr(row.bearingRad)}</b>&deg;T</span
                >
                <span class="metric">SOG <b class="num">{formatKnotsOr(row.sogMps)}</b> kn</span>
                {#if row.cpaMeters !== undefined}
                  <span class="metric">CPA <b class="num">{formatNm(row.cpaMeters)}</b> nm</span>
                {/if}
                {#if row.tcpaSeconds !== undefined}
                  <span class="metric"
                    >TCPA <b class="num">{formatTcpaMin(row.tcpaSeconds, 1)}</b> min</span
                  >
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</SlideOver>

<style>
.ais-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.sort {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.targets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
/* Each target is one tappable card: name on top, the mono readouts wrapping below. */
.target {
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
.target:hover {
  border-color: var(--accent);
}
.name {
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
