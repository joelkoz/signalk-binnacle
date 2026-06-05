<script lang="ts">
import { CloudUpload, Link2 } from '@lucide/svelte';
import type { UserCharts } from '$entities/user-charts';

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

async function run(action: () => Promise<void>): Promise<void> {
  busy = true;
  error = undefined;
  try {
    await action();
    onDone();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not add that chart.';
  } finally {
    busy = false;
  }
}

function addUrl(): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  void run(async () => {
    await userCharts.addUrl(trimmed);
    url = '';
  });
}

function pickFile(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  void run(() => userCharts.addFile(file));
  input.value = '';
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
  <div class="field">
    <span class="field-label caps-label" id="add-chart-url-label">
      <Link2 size={14} aria-hidden="true" />
      From a URL
    </span>
    <div class="url-row">
      <input
        class="url"
        type="url"
        placeholder="https://.../chart.pmtiles"
        aria-labelledby="add-chart-url-label"
        bind:value={url}
        disabled={busy}
      >
      <button type="button" class="btn btn-ghost" onclick={addUrl} disabled={busy || !url.trim()}>
        Add
      </button>
    </div>
  </div>

  <div class="divider" aria-hidden="true"><span>or</span></div>

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
      class="native-file"
      bind:this={fileInput}
      type="file"
      accept=".pmtiles"
      onchange={pickFile}
      disabled={busy}
      tabindex="-1"
      aria-hidden="true"
    >
  </div>

  {#if busy}
    <p class="status">Reading chart...</p>
  {:else if error}
    <p class="status error">{error}</p>
  {/if}

  <button type="button" class="btn btn-ghost" onclick={onDone} disabled={busy}>Close</button>
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
.url {
  flex: 1;
  min-inline-size: 0;
  min-block-size: var(--control-size);
  padding-inline: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
}
.divider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
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
}
.dropzone:hover:not(:disabled),
.dropzone.dragging {
  border-color: var(--accent);
  border-style: solid;
  color: var(--accent);
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
/* The native input drives the read via pickFile, but the themed dropzone is the visible control;
   keep it in the DOM and reachable while removing it from the layout. */
.native-file {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  margin: -1px;
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}
.status {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.status.error {
  color: var(--alarm);
}
</style>
