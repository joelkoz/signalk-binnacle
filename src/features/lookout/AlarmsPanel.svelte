<script lang="ts">
import { Bell, BellOff } from '@lucide/svelte';
import { formatCpaNm, formatTcpaMin, nauticalMilesToMeters } from '$shared/lib';
import { DEFAULT_THRESHOLDS, type PersistedValue, type Thresholds } from '$shared/settings';
import { SlideOver, UnitField } from '$shared/ui';
import { thresholdsCaution } from './thresholds-caution';

interface Props {
  thresholds: PersistedValue<Thresholds>;
  collisionMuted: boolean;
  collisionMuteRemainingMin: number | undefined;
  onToggleCollisionMute: () => void;
  arrivalMuted: boolean;
  onToggleArrivalMute: () => void;
  onClose: () => void;
  onBack?: () => void;
}

const {
  thresholds,
  collisionMuted,
  collisionMuteRemainingMin,
  onToggleCollisionMute,
  arrivalMuted,
  onToggleArrivalMute,
  onClose,
  onBack,
}: Props = $props();

const t = $derived(thresholds.value);

// Stored values are SI (meters, seconds); the editor works in nautical miles and minutes and
// converts at this edge. UnitField commits on blur, so typing is not reformatted mid-keystroke,
// and snaps its text back to the value prop, so a rejected negative entry never looks accepted.
function setMeters(key: 'dangerCpaMeters' | 'warningCpaMeters', nm: number): void {
  if (!Number.isFinite(nm) || nm < 0) return;
  thresholds.set({ ...thresholds.value, [key]: nauticalMilesToMeters(nm) });
}

function setSeconds(key: 'dangerTcpaSeconds' | 'warningTcpaSeconds', minutes: number): void {
  if (!Number.isFinite(minutes) || minutes < 0) return;
  thresholds.set({ ...thresholds.value, [key]: minutes * 60 });
}

const cpaNm = (meters: number): number => Number(formatCpaNm(meters));
const tcpaMin = (seconds: number): number => Number(formatTcpaMin(seconds));

const caution = $derived(thresholdsCaution(t));
</script>

<SlideOver title="Alarms" closeLabel="Close alarms panel" {onClose} {onBack}>
  <div class="alarms">
    <section class="mutes" aria-label="Mutes">
      <span class="caps-label">Mutes</span>
      <button
        type="button"
        class="mute-row"
        aria-pressed={collisionMuted}
        onclick={onToggleCollisionMute}
      >
        {#if collisionMuted}
          <BellOff size={18} aria-hidden="true" />
        {:else}
          <Bell size={18} aria-hidden="true" />
        {/if}
        <span>Mute collision alarm</span>
      </button>
      {#if collisionMuted && collisionMuteRemainingMin !== undefined}
        <p class="muted-note">auto re-arms in {collisionMuteRemainingMin} min</p>
      {/if}
      <button
        type="button"
        class="mute-row"
        aria-pressed={arrivalMuted}
        onclick={onToggleArrivalMute}
      >
        {#if arrivalMuted}
          <BellOff size={18} aria-hidden="true" />
        {:else}
          <Bell size={18} aria-hidden="true" />
        {/if}
        <span>Mute arrival alarm</span>
      </button>
    </section>
    <section class="thresholds" aria-label="Collision thresholds">
      <span class="caps-label">Collision thresholds</span>
      <div class="group">
        <span class="group-title caps-label danger">Danger</span>
        <UnitField
          label="CPA"
          unit="nm"
          min={0}
          step={0.05}
          ariaLabel="Danger CPA"
          value={cpaNm(t.dangerCpaMeters)}
          onCommit={(nm) => setMeters('dangerCpaMeters', nm)}
        />
        <UnitField
          label="TCPA"
          unit="min"
          min={0}
          step={1}
          ariaLabel="Danger TCPA"
          value={tcpaMin(t.dangerTcpaSeconds)}
          onCommit={(minutes) => setSeconds('dangerTcpaSeconds', minutes)}
        />
      </div>
      <div class="group">
        <span class="group-title caps-label warning">Warning</span>
        <UnitField
          label="CPA"
          unit="nm"
          min={0}
          step={0.05}
          ariaLabel="Warning CPA"
          value={cpaNm(t.warningCpaMeters)}
          onCommit={(nm) => setMeters('warningCpaMeters', nm)}
        />
        <UnitField
          label="TCPA"
          unit="min"
          min={0}
          step={1}
          ariaLabel="Warning TCPA"
          value={tcpaMin(t.warningTcpaSeconds)}
          onCommit={(minutes) => setSeconds('warningTcpaSeconds', minutes)}
        />
      </div>
      {#if caution}
        <p class="note" role="status">{caution}</p>
      {/if}
      <button
        type="button"
        class="btn btn-ghost reset"
        onclick={() => thresholds.set({ ...DEFAULT_THRESHOLDS })}
      >
        Reset to defaults
      </button>
    </section>
  </div>
</SlideOver>

<style>
.alarms {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  font-size: var(--text-base);
}
.mutes,
.thresholds {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.mute-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-block-size: var(--control-size);
  padding: 0.3rem var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: start;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast);
}
.mute-row[aria-pressed="true"] {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
/* The base look is the shared .caps-label; only the per-severity color is overridden here. */
.group-title.danger {
  color: var(--alarm);
}
.group-title.warning {
  color: var(--warning);
}
.note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--warning);
}
.reset {
  align-self: flex-start;
  margin-block-start: 0.1rem;
}
</style>
