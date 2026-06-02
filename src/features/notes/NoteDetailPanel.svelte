<script lang="ts">
import { ExternalLink, Star, X } from '@lucide/svelte';
import type { NoteSelection } from './notes-client';
import type { NormalizedItem, NoteDetail } from './notes-detail';
import { safeHttpUrl } from './notes-detail';
import { categoryLabel } from './poi-categories';

interface Props {
  selection: NoteSelection;
  load: (id: string) => Promise<NoteDetail | undefined>;
  onClose: () => void;
}

const { selection, load, onClose }: Props = $props();

let detail = $state<NoteDetail | undefined>();
let loading = $state(true);
let failed = $state(false);
let attempt = $state(0);

// A new selection or a retry re-runs the load; the object identity changes either way.
const request = $derived({ id: selection.id, attempt });

$effect(() => {
  const { id } = request;
  let active = true;
  loading = true;
  failed = false;
  detail = undefined;
  load(id)
    .then((result) => {
      if (!active) return;
      if (result) detail = result;
      else failed = true;
      loading = false;
    })
    .catch(() => {
      if (!active) return;
      failed = true;
      loading = false;
    });
  return () => {
    active = false;
  };
});

const rating = $derived.by(() => {
  for (const section of detail?.sections ?? []) {
    for (const item of section.items) {
      if (item.kind === 'rating') return Number(item.value);
    }
  }
  return undefined;
});

const credit = $derived(detail?.attribution ?? selection.attribution);
const extraSources = $derived((detail?.sources ?? []).filter((s) => s !== credit));
const sourceUrl = $derived(safeHttpUrl(detail?.url ?? selection.url ?? ''));

function measure(item: NormalizedItem): string {
  return item.unit ? `${item.value} ${item.unit}` : String(item.value);
}
</script>

<aside class="note-panel" aria-label="Point of interest detail">
  <header>
    <div class="heading">
      <h2>{selection.name}</h2>
      <span class="type">{categoryLabel(selection.category)}</span>
    </div>
    {#if rating !== undefined}
      <div class="rating" aria-label={`Rating ${rating} of 5`}>
        {#each [1, 2, 3, 4, 5] as n (n)}
          <Star
            size={14}
            fill={n <= Math.round(rating) ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        {/each}
      </div>
    {/if}
    <button type="button" class="close" aria-label="Close detail" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="body">
    {#if loading}
      <p class="status">Loading...</p>
    {:else if failed}
      <p class="status">Could not load detail.</p>
      <button type="button" class="retry" onclick={() => (attempt += 1)}>Retry</button>
    {:else if detail?.sections}
      {#each detail.sections as section (section.id)}
        <section>
          <h3>{section.title}</h3>
          <dl>
            {#each section.items as item, i (item.label + i)}
              {@const linkUrl =
                item.kind === 'link' && typeof item.value === 'string'
                  ? safeHttpUrl(item.value)
                  : undefined}
              <div class="item">
                <dt>{item.label}</dt>
                <dd>
                  {#if item.kind === 'availability'}
                    <span class="badge" data-value={String(item.value).toLowerCase()}
                      >{item.value}</span
                    >
                  {:else if item.kind === 'flag'}
                    <span class="badge" data-value={item.value === true ? 'yes' : 'no'}>
                      {item.value === true ? 'Yes' : 'No'}
                    </span>
                  {:else if linkUrl}
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer">{item.label}</a>
                  {:else if item.kind === 'measure'}
                    {measure(item)}
                  {:else if item.kind === 'note'}
                    <span class="prose">{item.value}</span>
                  {:else}
                    {item.value}
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
    {:else if detail?.fallbackText}
      <p class="prose">{detail.fallbackText}</p>
    {:else}
      <p class="status">No additional detail.</p>
    {/if}
  </div>

  {#if credit || sourceUrl}
    <footer>
      {#if credit}
        <span class="credit">{credit}</span>
      {/if}
      {#if extraSources.length > 0}
        <span class="credit">{extraSources.join(', ')}</span>
      {/if}
      {#if sourceUrl}
        <a class="source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
          View source <ExternalLink size={13} aria-hidden="true" />
        </a>
      {/if}
    </footer>
  {/if}
</aside>

<style>
.note-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: 22rem;
  max-inline-size: 100%;
  background: var(--surface-overlay);
  border-inline-start: 1px solid var(--border);
  box-shadow: -2px 0 12px rgb(0 0 0 / 0.25);
  color: var(--text);
  font-size: 0.85rem;
  overflow: hidden;
}
header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-block-end: 1px solid var(--border);
}
.heading {
  flex: 1;
  min-inline-size: 0;
}
.heading h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.type {
  color: var(--text-muted);
  font-size: 0.75rem;
}
.rating {
  display: inline-flex;
  color: var(--select);
}
.close {
  display: inline-flex;
  padding: 0.2rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.close:hover {
  color: var(--text);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}
.body section {
  margin-block-end: 0.75rem;
}
.body h3 {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
dl {
  margin: 0;
}
.item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  padding-block: 0.15rem;
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.badge {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  background: var(--surface);
  color: var(--text-muted);
}
.badge[data-value="yes"] {
  color: var(--accent);
}
.badge[data-value="nearby"] {
  color: var(--select);
}
.prose {
  white-space: pre-line;
  text-align: start;
}
.status {
  margin: 0.25rem 0;
  color: var(--text-muted);
}
.retry {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 0.3rem;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.72rem;
}
.source-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline-start: auto;
  color: var(--accent);
}
@media (max-width: 600px) {
  .note-panel {
    inline-size: 100%;
    block-size: auto;
    max-block-size: 60vh;
    border-inline-start: 0;
    border-block-start: 1px solid var(--border);
  }
}
</style>
