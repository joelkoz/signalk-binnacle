<script lang="ts">
import { Radar } from '@lucide/svelte';
import { PLACEHOLDER } from '$shared/lib';
import type { MarineRadarStore } from './marine-radar-store.svelte';
import { isPrimaryControl, widgetKind } from './radar-controls-model';
import type { ControlDefinition } from './radar-types';

let {
  store,
  onSetControl,
  onSetAuto,
  onSelectRadar,
}: {
  store: MarineRadarStore;
  onSetControl: (controlId: string, value: number) => void;
  onSetAuto: (controlId: string, auto: boolean) => void;
  onSelectRadar?: (id: string) => void;
} = $props();

const controls = $derived(store.capabilities);
// The everyday controls lead in their own section; everything else falls under Advanced. When the radar
// reports none of the primary ids the primary list is empty and the advanced section becomes the lone
// Controls section, so the panel never shows an empty heading.
const primary = $derived(controls.filter(isPrimaryControl));
const advanced = $derived(controls.filter((def) => !isPrimaryControl(def)));

const statusLabel = $derived.by(() => {
  switch (store.status) {
    case 'connecting':
      return 'Connecting to the radar';
    case 'live':
      return 'Live';
    case 'error':
      return 'No signal from the radar';
    default:
      return '';
  }
});

// The slider readout: the live value with its unit when the radar reports one, the shared placeholder
// until a value arrives. Capability ranges arrive in the provider's display units over the v2 API, so
// the value is rendered as given, never SI-converted.
function readout(def: ControlDefinition): string {
  const value = store.controlValues[def.id];
  if (value === undefined) return PLACEHOLDER;
  return def.range?.unit ? `${value} ${def.range.unit}` : String(value);
}

// Whether a control reports an auto/manual capability, so it gets an Auto toggle, and whether that
// control is currently in auto, so its manual widget is disabled while the radar drives the value.
const hasAuto = (def: ControlDefinition): boolean => def.modes?.includes('auto') === true;
const isAuto = (def: ControlDefinition): boolean => store.controlAuto[def.id] === true;
</script>

<!-- One labeled control: the name (and, for a slider, the live value) on a head row, then a full-width
     control beneath, so sliders and selects line up in a single column rather than at ragged offsets.
     The visible name is associated with the control via aria-labelledby across all three widget kinds. -->
{#snippet control(def: ControlDefinition)}
  {@const kind = widgetKind(def)}
  {@const labelId = `rc-${def.id}`}
  <div class="radar-field">
    <div class="field-head">
      <span class="field-name" id={labelId}>{def.name}</span>
      <div class="field-head-end">
        {#if kind === 'slider'}
          <span class="num field-value">{readout(def)}</span>
        {/if}
        {#if hasAuto(def)}
          <!-- An auto-capable control (gain, sea, rain): Auto hands the value to the radar and
               disables the manual widget; touching the widget returns it to manual. -->
          <button
            type="button"
            class="btn btn-compact auto-toggle"
            class:is-on={isAuto(def)}
            aria-pressed={isAuto(def)}
            disabled={def.readOnly}
            onclick={() => onSetAuto(def.id, !isAuto(def))}
          >
            Auto
          </button>
        {/if}
      </div>
    </div>
    {#if kind === 'slider'}
      <input
        type="range"
        class="range"
        min={def.range?.min ?? 0}
        max={def.range?.max ?? 100}
        step={def.range?.step ?? 1}
        disabled={def.readOnly || isAuto(def)}
        value={store.controlValues[def.id] ?? def.range?.min ?? 0}
        aria-labelledby={labelId}
        oninput={(e) => onSetControl(def.id, Number(e.currentTarget.value))}
      >
    {:else if kind === 'toggle'}
      <div class="segmented" role="group" aria-labelledby={labelId}>
        <button
          type="button"
          class="btn"
          class:is-on={!store.controlValues[def.id]}
          aria-pressed={!store.controlValues[def.id]}
          disabled={def.readOnly || isAuto(def)}
          onclick={() => onSetControl(def.id, 0)}
        >
          Off
        </button>
        <button
          type="button"
          class="btn"
          class:is-on={Boolean(store.controlValues[def.id])}
          aria-pressed={Boolean(store.controlValues[def.id])}
          disabled={def.readOnly || isAuto(def)}
          onclick={() => onSetControl(def.id, 1)}
        >
          On
        </button>
      </div>
    {:else}
      <select
        class="input"
        aria-labelledby={labelId}
        disabled={def.readOnly || isAuto(def)}
        value={String(store.controlValues[def.id] ?? '')}
        onchange={(e) => onSetControl(def.id, Number(e.currentTarget.value))}
      >
        {#each def.values ?? [] as opt (opt.value)}
          <option value={String(opt.value)}>{opt.label}</option>
        {/each}
      </select>
    {/if}
  </div>
{/snippet}

<section class="radar-section" aria-label="Radar status">
  <span class="caps-label">Radar</span>
  {#if statusLabel}
    <p class="radar-head">
      <Radar size={18} aria-hidden="true" />
      <span
        class="radar-status"
        class:is-error={store.status === 'error'}
        role="status"
        aria-live="polite"
      >
        {statusLabel}
      </span>
    </p>
  {/if}
  {#if store.radars.length === 0}
    <p class="muted-note">No radar connected.</p>
  {/if}
  {#if store.radars.length > 1}
    <select
      class="input"
      aria-label="Select radar"
      value={store.selectedId}
      onchange={(e) => onSelectRadar?.(e.currentTarget.value)}
    >
      {#each store.radars as r (r.id)}
        <option value={r.id}>{r.name}</option>
      {/each}
    </select>
  {/if}
</section>

{#if store.controlsForbidden}
  <p class="alert-note sev-warning" role="status">
    Adjusting radar controls needs read-write access. Approve Binnacle for read and write in the
    Signal K server's access requests, then reconnect.
  </p>
{/if}

{#if primary.length > 0}
  <section class="radar-section" aria-label="Controls">
    <span class="caps-label">Controls</span>
    {#each primary as def (def.id)}
      {@render control(def)}
    {/each}
  </section>
{/if}
{#if advanced.length > 0}
  <section class="radar-section" aria-label={primary.length ? 'Advanced controls' : 'Controls'}>
    <span class="caps-label">{primary.length ? 'Advanced' : 'Controls'}</span>
    {#each advanced as def (def.id)}
      {@render control(def)}
    {/each}
  </section>
{/if}

<style>
/* A titled group of fields, matching the alarm-thresholds .group pattern: a caps-label heading over a
   column of controls. The panel-body bodyFlex rhythm separates the sections. */
.radar-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
/* One control: the name (and the slider's live value) on a head row, then a full-width control beneath,
   so every slider track and select box shares one left and right edge. */
.radar-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
/* The live value and the Auto toggle share the trailing end of the head row, so an auto-capable
   control reads as one labeled line: name on the left, value and Auto on the right. */
.field-head-end {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* The per-field label uses the sentence-case muted field style (like UnitField), not the .caps-label
   section vocabulary, so a column of field names does not read as a stack of headings. */
.field-name {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.field-value {
  font-size: var(--text-sm);
  color: var(--text);
}
.radar-field select.input {
  inline-size: 100%;
}
.radar-field .segmented .btn {
  flex: 1;
}
/* The radar's identity row: the sweep glyph in the accent color paired with the live status. The
   glyph stays branded; the status text carries the muted or alarm state. */
.radar-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
}
.radar-head :global(svg) {
  flex-shrink: 0;
  color: var(--accent);
}
.radar-status {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.radar-status.is-error {
  color: var(--alarm);
}
</style>
