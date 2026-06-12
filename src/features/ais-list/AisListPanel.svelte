<script lang="ts">
import type { AisTargets } from '$entities/ais';
import type { CollisionAssessment } from '$entities/collision';
import type { UnitsStore } from '$entities/units';
import type { OwnVessel } from '$entities/vessel';
import type { LatLon } from '$shared/geo';
import {
  formatBearingOr,
  formatCpaNm,
  formatKnotsOr,
  formatMetersOrNm,
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

// list() reads aisVersion, so the rows re-derive as traffic moves; the own fix re-sorts by range.
const rows = $derived(
  buildAisRows(aisTargets.list(), vessel.position, collision.assessment.contacts, sort),
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
                class:danger={row.severity === 'danger'}
                class:warning={row.severity === 'warning'}
              >
                {row.label}
              </span>
              <span class="metrics">
                <span class="metric">
                  Range <b>{formatMetersOrNm(row.rangeMeters, units.mode)}</b>
                </span>
                <span class="metric">Brg <b>{formatBearingOr(row.bearingRad)}</b>&deg;T</span>
                <span class="metric">SOG <b>{formatKnotsOr(row.sogMps)}</b> kn</span>
                {#if row.cpaMeters !== undefined}
                  <span class="metric">CPA <b>{formatCpaNm(row.cpaMeters)}</b> nm</span>
                {/if}
                {#if row.tcpaSeconds !== undefined}
                  <span class="metric">TCPA <b>{formatTcpaMin(row.tcpaSeconds, 1)}</b> min</span>
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
.name.danger {
  color: var(--alarm);
}
.name.warning {
  color: var(--warning);
}
.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.metric b {
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
