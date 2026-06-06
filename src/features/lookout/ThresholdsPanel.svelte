<script lang="ts">
import { formatCpaNm, formatTcpaMin, nauticalMilesToMeters } from '$shared/lib';
import { DEFAULT_THRESHOLDS, type PersistedValue, type Thresholds } from '$shared/settings';
import { SlideOver } from '$shared/ui';

interface Props {
  thresholds: PersistedValue<Thresholds>;
  onClose: () => void;
  onBack?: () => void;
}

const { thresholds, onClose, onBack }: Props = $props();

const t = $derived(thresholds.value);

// Stored values are SI (meters, seconds); the editor works in nautical miles and minutes
// and converts at this edge. onchange (not oninput) means a value is committed on blur, so
// typing is not reformatted mid-keystroke.
function setMeters(key: 'dangerCpaMeters' | 'warningCpaMeters', nm: number): void {
  if (!Number.isFinite(nm) || nm < 0) return;
  thresholds.set({ ...thresholds.value, [key]: nauticalMilesToMeters(nm) });
}

function setSeconds(key: 'dangerTcpaSeconds' | 'warningTcpaSeconds', minutes: number): void {
  if (!Number.isFinite(minutes) || minutes < 0) return;
  thresholds.set({ ...thresholds.value, [key]: minutes * 60 });
}

const nm = (meters: number): string => formatCpaNm(meters);
const min = (seconds: number): string => formatTcpaMin(seconds);
</script>

<SlideOver title="Collision thresholds" {onClose} {onBack}>
  <section class="thresholds">
    <div class="group">
      <span class="group-title danger">Danger</span>
      <label class="field">
        <span class="name">CPA</span>
        <input
          type="number"
          min="0"
          step="0.05"
          aria-label="Danger CPA"
          value={nm(t.dangerCpaMeters)}
          onchange={(e) => setMeters('dangerCpaMeters', Number(e.currentTarget.value))}
        >
        <span class="unit">nm</span>
      </label>
      <label class="field">
        <span class="name">TCPA</span>
        <input
          type="number"
          min="0"
          step="1"
          aria-label="Danger TCPA"
          value={min(t.dangerTcpaSeconds)}
          onchange={(e) => setSeconds('dangerTcpaSeconds', Number(e.currentTarget.value))}
        >
        <span class="unit">min</span>
      </label>
    </div>
    <div class="group">
      <span class="group-title warning">Warning</span>
      <label class="field">
        <span class="name">CPA</span>
        <input
          type="number"
          min="0"
          step="0.05"
          aria-label="Warning CPA"
          value={nm(t.warningCpaMeters)}
          onchange={(e) => setMeters('warningCpaMeters', Number(e.currentTarget.value))}
        >
        <span class="unit">nm</span>
      </label>
      <label class="field">
        <span class="name">TCPA</span>
        <input
          type="number"
          min="0"
          step="1"
          aria-label="Warning TCPA"
          value={min(t.warningTcpaSeconds)}
          onchange={(e) => setSeconds('warningTcpaSeconds', Number(e.currentTarget.value))}
        >
        <span class="unit">min</span>
      </label>
    </div>
    <button
      type="button"
      class="btn btn-ghost reset"
      onclick={() => thresholds.set({ ...DEFAULT_THRESHOLDS })}
    >
      Reset to defaults
    </button>
  </section>
</SlideOver>

<style>
.thresholds {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-base);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.group-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
.group-title.danger {
  color: var(--alarm);
}
.group-title.warning {
  color: var(--warning);
}
.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.name {
  inline-size: 3rem;
  color: var(--text-muted);
}
.field input {
  inline-size: 5rem;
  min-block-size: var(--control-size);
  padding: 0.2rem var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  accent-color: var(--accent);
  font: inherit;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.unit {
  color: var(--text-muted);
}
.reset {
  align-self: flex-start;
  margin-block-start: 0.1rem;
}
</style>
