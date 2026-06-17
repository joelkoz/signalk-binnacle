<script lang="ts">
import { categoryLabel, POI_CATEGORIES, poiInlineIconSvg, type PoiCategory } from '$entities/poi-icons';
import type { SymbolsStore } from '$entities/symbols';
import type { SkSymbol } from '$shared/signalk';

// Optional "default" entry at the top of the list (e.g. "Default waypoint marker"). When provided,
// value='' selects it. If no override symbol exists for defaultOption.iconId, fallbackSvg renders.
export interface DefaultOption {
  iconId: string;      // ID resolved via symbols.resolve(iconId, role) to detect an override
  label: string;
  fallbackSvg: string; // SVG string shown when there is no symbol override
}

type IconOption =
  | { value: string; label: string; kind: 'default' }
  | { value: string; label: string; kind: 'poi'; category: PoiCategory }
  | { value: string; label: string; kind: 'symbol'; url: string };

interface Props {
  value: string;
  symbols?: SymbolsStore;
  // Symbol role used for both forRole() filtering and override resolution (e.g. 'waypoint', 'note').
  role: string;
  defaultOption?: DefaultOption;
  id?: string;
}

let { value = $bindable(), symbols, role, defaultOption, id }: Props = $props();

function iconRef(symbol: SkSymbol): string {
  return (
    symbol.aliases.find((a) => a.startsWith('custom:')) ??
    symbol.aliases.find((a) => a.startsWith('binnacle:')) ??
    symbol.aliases[0]
  );
}

const poiOptions: IconOption[] = $derived(
  POI_CATEGORIES.map((cat) => ({
    value: cat,
    label: categoryLabel(cat),
    kind: 'poi' as const,
    category: cat,
  })),
);

const symbolOptions: IconOption[] = $derived(
  (symbols?.forRole(role) ?? []).map((s) => ({
    value: iconRef(s),
    label: s.name,
    kind: 'symbol' as const,
    url: s.url,
  })),
);

const options: IconOption[] = $derived([
  ...(defaultOption ? [{ value: '', label: defaultOption.label, kind: 'default' as const }] : []),
  ...poiOptions,
  ...symbolOptions,
]);

const selected: IconOption = $derived(options.find((o) => o.value === value) ?? options[0]);

// The default option and each POI category may have a binnacle: override in the symbols store;
// the same resolution path the overlay's managedIcon uses: symbols.resolve(bareId, role).
const defaultSymbol = $derived(
  defaultOption ? symbols?.resolve(defaultOption.iconId, role) : undefined,
);
const poiOverrides = $derived(
  new Map(
    POI_CATEGORIES
      .map((cat) => [cat, symbols?.resolve(cat, role)] as const)
      .filter((entry): entry is [PoiCategory, NonNullable<typeof entry[1]>] => entry[1] !== undefined)
      .map(([cat, sym]) => [cat, sym.url] as const),
  ),
);

let open = $state(false);
let pickerEl: HTMLElement | undefined;
let triggerEl: HTMLButtonElement | undefined;
const optionEls: (HTMLElement | null)[] = [];

$effect(() => {
  if (!open) return;
  const close = (e: MouseEvent) => {
    if (pickerEl && !pickerEl.contains(e.target as Node)) open = false;
  };
  window.addEventListener('click', close, { capture: true });
  return () => window.removeEventListener('click', close, { capture: true });
});

function select(v: string): void {
  value = v;
  open = false;
  triggerEl?.focus();
}

function openAndFocus(): void {
  open = true;
  const idx = options.findIndex((o) => o.value === value);
  const target = idx >= 0 ? idx : 0;
  setTimeout(() => optionEls[target]?.focus(), 0);
}

function handleTriggerKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault();
    openAndFocus();
  }
}

function handleOptionKey(e: KeyboardEvent, i: number): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    optionEls[Math.min(i + 1, options.length - 1)]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (i === 0) {
      open = false;
      triggerEl?.focus();
    } else {
      optionEls[i - 1]?.focus();
    }
  } else if (e.key === 'Escape') {
    open = false;
    triggerEl?.focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    select(options[i].value);
  }
}

// Offset into options[] where POI categories start (0 or 1 depending on defaultOption).
const poiStart = $derived(defaultOption ? 1 : 0);
</script>

<div class="icon-picker" bind:this={pickerEl}>
  <button
    type="button"
    class="picker-trigger"
    {id}
    bind:this={triggerEl}
    aria-expanded={open}
    aria-haspopup="listbox"
    onclick={() => (open ? (open = false) : openAndFocus())}
    onkeydown={handleTriggerKey}
  >
    <span class="picker-icon">
      {#if selected.kind === 'poi'}
        {#if poiOverrides.has(selected.category)}
          <img src={poiOverrides.get(selected.category)} width="20" height="20" alt="">
        {:else}
          {@html poiInlineIconSvg(selected.category)}
        {/if}
      {:else if selected.kind === 'symbol'}
        <img src={selected.url} width="20" height="20" alt="">
      {:else if defaultSymbol}
        <img src={defaultSymbol.url} width="20" height="20" alt="">
      {:else}
        {@html defaultOption?.fallbackSvg ?? ''}
      {/if}
    </span>
    <span class="picker-label">{selected.label}</span>
    <svg class="picker-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </button>

  {#if open}
  <ul class="picker-list" role="listbox" aria-label="Icon">
    {#each options as opt, i (opt.value)}
      {#if i === poiStart}
        <li class="picker-group-label" role="presentation">POI categories</li>
      {:else if i === poiStart + poiOptions.length && symbolOptions.length > 0}
        <li class="picker-group-label" role="presentation">Custom symbols</li>
      {/if}
      <li
        role="option"
        aria-selected={value === opt.value}
        class:is-selected={value === opt.value}
        tabindex={-1}
        bind:this={optionEls[i]}
        onclick={() => select(opt.value)}
        onkeydown={(e) => handleOptionKey(e, i)}
      >
        <span class="picker-icon">
          {#if opt.kind === 'poi'}
            {#if poiOverrides.has(opt.category)}
              <img src={poiOverrides.get(opt.category)} width="20" height="20" alt="">
            {:else}
              {@html poiInlineIconSvg(opt.category)}
            {/if}
          {:else if opt.kind === 'symbol'}
            <img src={opt.url} width="20" height="20" alt="">
          {:else if defaultSymbol}
            <img src={defaultSymbol.url} width="20" height="20" alt="">
          {:else}
            {@html defaultOption?.fallbackSvg ?? ''}
          {/if}
        </span>
        <span>{opt.label}</span>
      </li>
    {/each}
  </ul>
  {/if}
</div>

<style>
.icon-picker {
  position: relative;
  inline-size: 100%;
}

.picker-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  inline-size: 100%;
  padding: var(--space-2);
  font-size: var(--text-md);
  text-align: start;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.picker-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.picker-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
}

.picker-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
}

.picker-list {
  position: absolute;
  inset-block-start: calc(100% + 2px);
  inset-inline-start: 0;
  inline-size: 100%;
  max-block-size: 16rem;
  overflow-y: auto;
  margin: 0;
  padding: var(--space-1) 0;
  list-style: none;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
  z-index: var(--z-menu);
}

.picker-list li[role='option'] {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  font-size: var(--text-md);
  color: var(--text);
}

.picker-list li[role='option']:hover,
.picker-list li[role='option']:focus {
  background: var(--accent-tint);
  outline: none;
}

.picker-list li[role='option'].is-selected {
  background: var(--accent-tint-strong);
}

.picker-group-label {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  border-block-start: 1px solid var(--border);
  margin-block-start: var(--space-1);
}

.picker-group-label:first-child {
  margin-block-start: 0;
  border-block-start: none;
}
</style>
