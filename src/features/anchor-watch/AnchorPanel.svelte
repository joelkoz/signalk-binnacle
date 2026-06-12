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
import { formatFixed, PLACEHOLDER } from '$shared/lib';
import { InlineConfirm, SlideOver, UnitField } from '$shared/ui';

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

// Below-minimum entries clamp up, matching the entity; UnitField snaps the text back to the
// effective radius after the commit, so a rejected entry never sits in the box looking accepted.
function commitRadius(meters: number): void {
  onSetRadius(Math.max(MIN_RADIUS_M, meters));
}

// Raising ends the watch and silences the alarm in one motion, so the panel matches the strip's
// armed-confirm protection: the first tap swaps the controls row for an inline confirm.
let raiseArmed = $state(false);
$effect(() => {
  if (!watching) raiseArmed = false;
});

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
        <span class="num">{watching ? formatFixed(anchor.radiusMeters, 0) : PLACEHOLDER}</span>
        <span class="unit">m</span>
      </dd>
      {#if vessel.depthMeters !== undefined}
        <dt>Depth</dt>
        <dd>
          <span class="num">{formatFixed(vessel.depthMeters, 1)}</span><span class="unit">m</span>
        </dd>
      {/if}
    </dl>
    <UnitField
      label="Watch radius"
      unit="m"
      min={MIN_RADIUS_M}
      step={1}
      ariaLabel="Watch radius in meters"
      value={Math.round(anchor.radiusMeters ?? anchor.preferredRadiusMeters)}
      onCommit={commitRadius}
    />
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
    {#if watching && raiseArmed}
      <InlineConfirm
        question="Raise the anchor and end the watch?"
        confirmLabel="Raise"
        onConfirm={() => {
          raiseArmed = false;
          onRaise();
        }}
        onCancel={() => {
          raiseArmed = false;
        }}
      />
    {:else}
      <div class="panel-controls">
        {#if watching}
          <button
            type="button"
            class="btn btn-danger"
            onclick={() => {
              raiseArmed = true;
            }}
          >
            <Anchor size={16} aria-hidden="true" />
            Raise anchor
          </button>
        {:else}
          <button
            type="button"
            class="btn btn-primary"
            disabled={!vessel.position}
            onclick={onDrop}
          >
            <Anchor size={16} aria-hidden="true" />
            Drop anchor here
          </button>
        {/if}
      </div>
    {/if}
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
.unit {
  color: var(--text-muted);
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
