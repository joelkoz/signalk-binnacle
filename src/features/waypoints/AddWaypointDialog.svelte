<script lang="ts">
import type { SymbolsStore } from '$entities/symbols';
import type { SkSymbol } from '$shared/signalk';
import { dialog, focusOnMount } from '$shared/ui';

// A small modal for naming a new waypoint and choosing its icon. The icon list is the built-in
// default marker plus the provided symbols (signalk-symbol-manager) that declare the `waypoint`
// role; on a stock server only the default is offered. Replaces the bare name prompt.

interface Props {
  defaultName: string;
  symbols?: SymbolsStore;
  // icon is a Symbols API reference (e.g. 'custom:dive-flag'), or undefined for the default marker.
  onSave: (result: { name: string; icon?: string }) => void;
  onCancel: () => void;
}

const { defaultName, symbols, onSave, onCancel }: Props = $props();

// Persist a stable qualified reference: prefer the user's `custom:` alias, then Binnacle's vendor
// `binnacle:` alias, falling back to the first adopted alias.
function iconRef(symbol: SkSymbol): string {
  return (
    symbol.aliases.find((a) => a.startsWith('custom:')) ??
    symbol.aliases.find((a) => a.startsWith('binnacle:')) ??
    symbol.aliases[0]
  );
}

const options = $derived([
  { value: '', label: 'Default marker' },
  ...(symbols?.forRole('waypoint') ?? []).map((s) => ({ value: iconRef(s), label: s.name })),
]);

// Empty means "use the default": save() falls back to defaultName, shown as the placeholder.
let name = $state('');
let icon = $state('');

function save(): void {
  onSave({ name: name.trim() || defaultName, icon: icon || undefined });
}
</script>

<div class="wp-scrim">
  <div
    class="wp-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Add waypoint"
    tabindex="-1"
    use:dialog={onCancel}
  >
    <header><h2>Add waypoint</h2></header>
    <div class="wp-body">
      <label class="wp-field">
        <span class="caps-label">Name</span>
        <input
          type="text"
          bind:value={name}
          placeholder={defaultName}
          use:focusOnMount
          onkeydown={(e) => {
            if (e.key === 'Enter') save();
          }}
        >
      </label>
      <label class="wp-field">
        <span class="caps-label">Icon</span>
        <select bind:value={icon}>
          {#each options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    </div>
    <footer>
      <button type="button" class="btn" onclick={onCancel}>Cancel</button>
      <button type="button" class="btn btn-pill is-on" onclick={save}>Save</button>
    </footer>
  </div>
</div>

<style>
.wp-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  background: var(--scrim);
}
.wp-dialog {
  inline-size: min(22rem, calc(100dvw - 2 * var(--space-4)));
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.wp-dialog header {
  padding: var(--space-3) var(--space-4);
  border-block-end: 1px solid var(--border);
}
.wp-dialog h2 {
  margin: 0;
  font-size: var(--text-lg);
}
.wp-body {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}
.wp-field {
  display: grid;
  gap: var(--space-1);
}
.wp-field input,
.wp-field select {
  inline-size: 100%;
  padding: var(--space-2);
  font-size: var(--text-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
}
.wp-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-block-start: 1px solid var(--border);
}
</style>
