<script lang="ts">
import { Link2 } from '@lucide/svelte';
import type { DraftChart, UserCharts } from '$entities/user-charts';
import { focusOnMount } from '$shared/ui';
import ChartSpecList from './ChartSpecList.svelte';
import { chartSpecRows } from './chart-spec';

interface Props {
  userCharts: UserCharts;
  onDone: () => void;
}

const { userCharts, onDone }: Props = $props();

let url = $state('');
let busy = $state(false);
let error = $state<string | undefined>();
// A staged import awaiting review. While set, the form shows the rename-and-review step instead of
// the import inputs; committing it saves the chart.
let draft = $state<DraftChart | undefined>();
let draftName = $state('');

const draftRows = $derived.by(() => {
  if (!draft) return [];
  const spec = chartSpecRows(draft.source);
  return [
    spec.type,
    spec.zoom,
    { label: 'Stored', value: 'This device, and shared to the server' },
  ];
});

// The busy and error envelope shared by the read-to-stage and the commit steps.
async function withBusy(action: () => Promise<void>, fallbackError: string): Promise<void> {
  busy = true;
  error = undefined;
  try {
    await action();
  } catch (e) {
    error = e instanceof Error ? e.message : fallbackError;
  } finally {
    busy = false;
  }
}

// Stage an import by reading its metadata, without saving, so the review step can rename it first.
function stageUrl(): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  void withBusy(async () => {
    const next = await userCharts.stageUrl(trimmed);
    draft = next;
    draftName = next.source.name;
  }, 'Could not read that chart.');
}

function saveDraft(): void {
  const staged = draft;
  if (!staged) return;
  void withBusy(async () => {
    userCharts.commit(staged, draftName);
    draft = undefined;
    draftName = '';
    onDone();
  }, 'Could not add that chart.');
}

function cancelDraft(): void {
  draft = undefined;
  draftName = '';
  error = undefined;
}
</script>

<div class="add-form">
  {#if draft}
    <div class="review" role="group" aria-label="Review imported chart">
      <span class="field-label caps-label">Review and save</span>
      <label class="name-field">
        <span class="caps-label">Name</span>
        <input class="input" type="text" use:focusOnMount bind:value={draftName} disabled={busy}>
      </label>
      <ChartSpecList rows={draftRows} />
      <div class="panel-controls">
        <button
          type="button"
          class="btn btn-primary"
          onclick={saveDraft}
          disabled={busy || !draftName.trim()}
        >
          Save chart
        </button>
        <button type="button" class="btn" onclick={cancelDraft} disabled={busy}>Cancel</button>
      </div>
    </div>
  {:else}
    <div class="field">
      <span class="field-label caps-label" id="add-chart-url-label">
        <Link2 size={14} aria-hidden="true" />
        From a URL
      </span>
      <div class="url-row">
        <input
          class="input url"
          type="url"
          placeholder="https://.../chart.pmtiles"
          aria-labelledby="add-chart-url-label"
          bind:value={url}
          disabled={busy}
        >
        <button
          type="button"
          class="btn btn-ghost"
          onclick={stageUrl}
          disabled={busy || !url.trim()}
        >
          Add
        </button>
      </div>
      <p class="hint">
        For chart files on the server, install the signalk-pmtiles-plugin and drop files in its
        charts folder; they appear here automatically.
      </p>
    </div>
  {/if}

  {#if busy}
    <p class="status">{draft ? 'Saving chart...' : 'Reading chart...'}</p>
  {:else if error}
    <p class="alert-note" role="alert">{error}</p>
  {/if}

  {#if !draft}
    <button type="button" class="btn btn-ghost" onclick={onDone} disabled={busy}>Close</button>
  {/if}
</div>

<style>
.add-form {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-block: 0.4rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.field-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.url-row {
  display: flex;
  gap: 0.4rem;
}
/* The box styling comes from the shared .input; only the flex sizing is local. */
.url {
  flex: 1;
  min-inline-size: 0;
}
.hint,
.status {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
/* The review-and-rename step shown after an import is staged, before it is saved. */
.review {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.name-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
</style>
