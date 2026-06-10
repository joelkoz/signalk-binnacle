<script lang="ts">
import { CloudUpload, Link2 } from '@lucide/svelte';
import { type DraftChart, type UserCharts, zoomRange } from '$entities/user-charts';
import { formatBytes } from '$shared/lib';
import { focusOnMount } from '$shared/ui';
import ChartSpecList from './ChartSpecList.svelte';

interface Props {
  userCharts: UserCharts;
  onDone: () => void;
}

const { userCharts, onDone }: Props = $props();

let url = $state('');
let busy = $state(false);
let error = $state<string | undefined>();
let dragging = $state(false);
let fileInput = $state<HTMLInputElement>();
// A staged import awaiting review. While set, the form shows the rename-and-review step instead of
// the import inputs; committing it saves the chart.
let draft = $state<DraftChart | undefined>();
let draftName = $state('');

const draftRows = $derived(
  draft
    ? [
        { label: 'Type', value: draft.source.kind === 'vector' ? 'Vector' : 'Raster' },
        { label: 'Zoom', value: zoomRange(draft.source) },
        ...(draft.source.byteSize
          ? [{ label: 'Size', value: formatBytes(draft.source.byteSize) }]
          : []),
        {
          label: 'Stored',
          value:
            draft.source.origin.type === 'url'
              ? 'This device, and shared to the server'
              : 'This device',
        },
      ]
    : [],
);

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
function stage(read: () => Promise<DraftChart>): Promise<void> {
  return withBusy(async () => {
    const next = await read();
    draft = next;
    draftName = next.source.name;
  }, 'Could not read that chart.');
}

function stageUrl(): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  void stage(() => userCharts.stageUrl(trimmed));
}

function pickFile(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  void stage(() => userCharts.stageFile(file));
  input.value = '';
}

function saveDraft(): void {
  const staged = draft;
  if (!staged) return;
  void withBusy(async () => {
    await userCharts.commit(staged, draftName);
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

function browse(): void {
  if (busy) return;
  fileInput?.click();
}

// Route a dropped file through the hidden input so the single read path stays pickFile: set the
// input's files, then dispatch the change it would have fired from the native dialog.
function dropFile(event: DragEvent): void {
  // Without this the browser navigates to the dropped file instead of importing it.
  event.preventDefault();
  dragging = false;
  if (busy || !fileInput) return;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

function dragOver(event: DragEvent): void {
  if (busy) return;
  event.preventDefault();
  dragging = true;
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
    </div>

    <div class="divider caps-label" aria-hidden="true"><span>or</span></div>

    <div class="field">
      <span class="field-label caps-label" id="add-chart-file-label">
        <CloudUpload size={14} aria-hidden="true" />
        From a file
      </span>
      <button
        type="button"
        class="dropzone"
        class:dragging
        aria-labelledby="add-chart-file-label"
        aria-describedby="add-chart-file-hint"
        onclick={browse}
        ondragenter={dragOver}
        ondragover={dragOver}
        ondragleave={() => (dragging = false)}
        ondrop={dropFile}
        disabled={busy}
      >
        <CloudUpload size={22} aria-hidden="true" />
        <span class="drop-primary">Drop a .pmtiles file</span>
        <span class="drop-secondary" id="add-chart-file-hint">or tap to browse</span>
      </button>
      <input
        class="visually-hidden"
        bind:this={fileInput}
        type="file"
        accept=".pmtiles"
        onchange={pickFile}
        disabled={busy}
        tabindex="-1"
        aria-hidden="true"
      >
    </div>
  {/if}

  {#if busy}
    <p class="status">{draft ? 'Saving chart...' : 'Reading chart...'}</p>
  {:else if error}
    <p class="status error" role="alert">{error}</p>
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
.divider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.divider::before,
.divider::after {
  content: "";
  flex: 1;
  block-size: 1px;
  background: var(--border);
}
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  inline-size: 100%;
  min-block-size: calc(var(--control-size) + 1.25rem);
  padding: 0.55rem var(--space-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: var(--text-muted);
  font: inherit;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background-color var(--transition-fast);
}
.dropzone:hover:not(:disabled),
.dropzone.dragging {
  border-color: var(--accent);
  border-style: solid;
  color: var(--accent);
}
.dropzone.dragging {
  background: var(--accent-tint);
}
.dropzone:disabled {
  cursor: default;
  opacity: var(--disabled-opacity);
}
.drop-primary {
  font-size: var(--text-sm);
  font-weight: 600;
}
.drop-secondary {
  font-size: var(--text-xs);
}
.status {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.status.error {
  color: var(--alarm);
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
