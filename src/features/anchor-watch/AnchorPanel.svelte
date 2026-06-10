<script lang="ts">
import { Anchor, Crosshair } from '@lucide/svelte';
import {
  type AnchorMode,
  type AnchorWatch,
  CAPTURE_MARGIN_M,
  capturedRadius,
  MIN_RADIUS_M,
} from '$entities/anchor';
import type { OwnVessel } from '$entities/vessel';
import { formatFixed } from '$shared/lib';
import { SlideOver } from '$shared/ui';

interface Props {
  anchor: AnchorWatch;
  vessel: OwnVessel;
  // A failed server call (set radius, move, raise), shown until the next anchor action.
  error?: string;
  onDrop: () => void;
  onRaise: () => void;
  onSetRadius: (meters: number) => void;
  onClose: () => void;
  onBack?: () => void;
}

const { anchor, vessel, error, onDrop, onRaise, onSetRadius, onClose, onBack }: Props = $props();

const watching = $derived(anchor.watching);
const distance = $derived(anchor.distanceMeters);

const MODE_STATUS: Record<AnchorMode, string> = {
  server: 'Watching on the server. The alarm keeps running when Binnacle is closed.',
  client: 'Watching in this browser only. Keep Binnacle open for the alarm.',
  off: 'No anchor down.',
};
const statusLine = $derived(
  anchor.dragging ? 'Dragging: the boat is outside the watch radius.' : MODE_STATUS[anchor.mode],
);

function commitRadius(raw: string): void {
  const meters = Number(raw);
  if (!Number.isFinite(meters) || meters < MIN_RADIUS_M) return;
  onSetRadius(meters);
}

// Capture the real swing: the live distance plus a safety margin becomes the new radius.
function captureFromDistance(): void {
  if (distance == null) return;
  onSetRadius(capturedRadius(distance));
}
</script>

<SlideOver title="Anchor watch" {onClose} {onBack}>
  <section class="anchor-watch">
    <p class="status" class:status--alarm={anchor.dragging} role="status">{statusLine}</p>
    <dl class="stat-grid">
      <dt>Distance</dt>
      <dd><span class="num">{formatFixed(distance, 0)}</span><span class="unit">m</span></dd>
      <dt>Radius</dt>
      <dd>
        <span class="num">{watching ? formatFixed(anchor.radiusMeters, 0) : '--'}</span>
        <span class="unit">m</span>
      </dd>
      {#if vessel.depthMeters !== undefined}
        <dt>Depth</dt>
        <dd>
          <span class="num">{formatFixed(vessel.depthMeters, 1)}</span><span class="unit">m</span>
        </dd>
      {/if}
    </dl>
    <label class="field">
      <span class="name">Watch radius</span>
      <input
        class="input"
        type="number"
        min={MIN_RADIUS_M}
        step="1"
        aria-label="Watch radius in meters"
        value={Math.round(anchor.radiusMeters ?? anchor.preferredRadiusMeters)}
        onchange={(e) => commitRadius(e.currentTarget.value)}
      >
      <span class="unit">m</span>
    </label>
    <button
      type="button"
      class="btn btn-ghost"
      disabled={!watching || distance == null}
      title="Set the radius to the current distance plus a {CAPTURE_MARGIN_M} m margin"
      onclick={captureFromDistance}
    >
      <Crosshair size={16} aria-hidden="true" />
      Set from current distance
    </button>
    <div class="controls">
      {#if watching}
        <button type="button" class="btn btn-danger" onclick={onRaise}>
          <Anchor size={16} aria-hidden="true" />
          Raise anchor
        </button>
      {:else}
        <button type="button" class="btn btn-primary" disabled={!vessel.position} onclick={onDrop}>
          <Anchor size={16} aria-hidden="true" />
          Drop anchor here
        </button>
      {/if}
    </div>
    {#if !watching && !vessel.position}
      <p class="hint">Waiting for a GPS fix to drop the anchor at.</p>
    {/if}
    {#if watching}
      <p class="hint">Drag the anchor marker on the chart to correct the drop point.</p>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </section>
</SlideOver>

<style>
.anchor-watch {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--text-base);
}
.status {
  margin: 0;
  color: var(--text-muted);
}
.status--alarm {
  color: var(--alarm);
  font-weight: 600;
}
.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.name {
  color: var(--text-muted);
}
.field input {
  inline-size: 5.5rem;
  accent-color: var(--accent);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.unit {
  color: var(--text-muted);
}
.controls {
  display: flex;
  gap: var(--space-2);
}
.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.error {
  margin: 0;
  color: var(--alarm);
}
</style>
