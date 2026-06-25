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

<SlideOver
  title="AIS targets"
  subtitle="{rows.length} tracked"
  closeLabel="Close AIS targets"
  {onClose}
  {onBack}
  bodyFlex
>
  <div class="nav-sort">
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
    <ul class="nav-list">
      {#each rows as row (row.id)}
        <li>
          <button
            type="button"
            class="nav-row"
            title="Show {row.label} on the chart"
            onclick={() => onLocate(row.position)}
          >
            <span
              class="nav-name"
              class:sev-danger={row.severity === 'danger'}
              class:sev-warning={row.severity === 'warning'}
            >
              {row.label}
            </span>
            <span class="nav-metrics">
              <span class="nav-metric">
                Range <b class="num">{formatMetersOrNm(row.rangeMeters, units.mode)}</b>
              </span>
              <span class="nav-metric"
                >Brg <b class="num">{formatBearingOr(row.bearingRad)}</b>&deg;T</span
              >
              <span class="nav-metric">SOG <b class="num">{formatKnotsOr(row.sogMps)}</b> kn</span>
              {#if row.cpaMeters !== undefined}
                <span class="nav-metric">CPA <b class="num">{formatNm(row.cpaMeters)}</b> nm</span>
              {/if}
              {#if row.tcpaSeconds !== undefined}
                <span class="nav-metric"
                  >TCPA <b class="num">{formatTcpaMin(row.tcpaSeconds, 1)}</b> min</span
                >
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</SlideOver>

<style>
/* No scoped styles: the list rows, the readout line, and the sort header come from the shared .nav-*
   family in cards.css (shared with the POI search panel), and the body's gapped column comes from
   SlideOver's bodyFlex. */
</style>
