<script lang="ts">
import { ExternalLink, Star, X } from '@lucide/svelte';
import { dialog } from '$shared/ui';
import type { NoteSelection } from './notes-client';
import type { NormalizedItem, NoteDetail } from './notes-detail';
import { safeHttpUrl } from './notes-detail';
import { isDangerFlag, isRedundantNoteLabel, orderSections } from './notes-present';
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

const STARS = [1, 2, 3, 4, 5];

// Order sections by helm relevance: facts first, reviews and provenance last.
const sections = $derived(detail?.sections ? orderSections(detail.sections) : undefined);

const credit = $derived(detail?.attribution ?? selection.attribution);
const extraSources = $derived((detail?.sources ?? []).filter((s) => s !== credit));
const sourceUrl = $derived(safeHttpUrl(detail?.url ?? selection.url ?? ''));

function measure(item: NormalizedItem): string {
  return item.unit ? `${item.value} ${item.unit}` : String(item.value);
}
</script>

<aside
  class="slide-over slide-over--dock-right"
  aria-label="Point of interest detail"
  use:dialog={onClose}
>
  <header>
    <div class="heading">
      <h2 class="panel-title">{selection.name}</h2>
      <span class="type">{categoryLabel(selection.category)}</span>
    </div>
    <button type="button" class="panel-close" aria-label="Close detail" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="body">
    {#if loading}
      <p class="status" role="status">Loading...</p>
    {:else if failed}
      <p class="status" role="alert">Could not load detail.</p>
      <button type="button" class="btn btn-ghost" onclick={() => (attempt += 1)}>Retry</button>
    {:else if sections}
      {#each sections as section (section.id)}
        <section>
          <h3 class="caps-label">{section.title}</h3>
          <dl>
            {#each section.items as item, i (item.label + i)}
              {@const linkUrl =
                item.kind === 'link' && typeof item.value === 'string'
                  ? safeHttpUrl(item.value)
                  : undefined}
              {#if isDangerFlag(item.label, item.kind)}
                <div class="alert" data-danger={item.value === true}>
                  {item.value === true ? 'Dangerous to navigation' : 'Not a danger to navigation'}
                </div>
              {:else if item.kind === 'note'}
                <div class="note-item">
                  {#if !isRedundantNoteLabel(item.label, section.title)}
                    <dt>{item.label}</dt>
                  {/if}
                  <dd class="prose">{item.value}</dd>
                </div>
              {:else}
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
                      <a href={linkUrl} target="_blank" rel="noopener noreferrer"
                        >{item.label}<span class="visually-hidden"> (opens in a new tab)</span></a
                      >
                    {:else if item.kind === 'rating'}
                      {@const filled = Math.round(Number(item.value))}
                      <span
                        class="rating"
                        role="img"
                        aria-label={`Rating ${Number(item.value)} of 5`}
                      >
                        {#each STARS as n (n)}
                          <Star
                            size={14}
                            fill={n <= filled ? 'currentColor' : 'none'}
                            aria-hidden="true"
                          />
                        {/each}
                      </span>
                    {:else if item.kind === 'measure'}
                      {measure(item)}
                    {:else}
                      {item.value}
                    {/if}
                  </dd>
                </div>
              {/if}
            {/each}
          </dl>
        </section>
      {/each}
    {:else if detail?.fallbackText}
      <p class="prose">{detail.fallbackText}</p>
    {:else}
      <p class="status" role="status">No additional detail</p>
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
          View source <span class="visually-hidden">(opens in a new tab)</span>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      {/if}
    </footer>
  {/if}
</aside>

<style>
header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 0.6rem var(--space-3);
  border-block-end: 1px solid var(--border);
}
.heading {
  flex: 1;
  min-inline-size: 0;
}
.type {
  color: var(--text-muted);
  font-size: var(--text-xs);
}
.rating {
  display: inline-flex;
  color: var(--select);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.body section {
  margin-block-end: var(--space-3);
}
.body h3 {
  margin-block: 0 var(--space-1);
}
dl {
  margin: 0;
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
}
.item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-2);
  padding-block: 0.15rem;
}
.item dd {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
/* A note carries prose, so it spans the full width below its label instead of being squeezed
   into the value column and right-aligned. */
.note-item {
  padding-block: 0.2rem;
}
.note-item dd {
  margin-block-start: 0.15rem;
  line-height: 1.4;
}
/* The hazard danger status leads its section as a full-width banner: an alarm fill when the
   feature is dangerous to navigation, a quiet outline when it is explicitly not. */
.alert {
  margin-block: 0.2rem;
  padding: 0.4rem 0.55rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
}
/* A bordered, tinted caution rather than a solid bright fill, so the hazard reads clearly without
   painting the brightest pixel in the palette (the night-red --alarm) across a full-width block.
   This matches the weather warning treatment. */
.alert[data-danger="true"] {
  border: 1px solid var(--alarm);
  background: var(--alarm-tint);
  color: var(--text);
}
.alert[data-danger="false"] {
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-weight: 400;
}
.badge {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  background: var(--surface-raised);
  color: var(--text-muted);
}
.badge[data-value="yes"] {
  color: var(--accent);
  border-color: var(--accent);
}
.badge[data-value="nearby"] {
  color: var(--select);
  border-color: var(--select);
}
.prose {
  white-space: pre-line;
  text-align: start;
}
.status {
  margin-block: var(--space-1);
  color: var(--text-muted);
}
footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-xs);
}
.source-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-block-size: var(--control-size);
  margin-inline-start: auto;
  color: var(--accent);
}
</style>
