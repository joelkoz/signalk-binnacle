<script lang="ts">
import type { UserCharts } from '$entities/user-charts';

interface Props {
  userCharts: UserCharts;
  onDone: () => void;
}

const { userCharts, onDone }: Props = $props();

let url = $state('');
let busy = $state(false);
let error = $state<string | undefined>();

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
</script>

<div class="add-form">
  <div class="url-row">
    <input
      class="url"
      type="url"
      placeholder="https://.../chart.pmtiles"
      bind:value={url}
      disabled={busy}
    >
    <button type="button" class="go" onclick={addUrl} disabled={busy || !url.trim()}>Add</button>
  </div>
  <label class="file">
    <span>or choose a .pmtiles file</span>
    <input type="file" accept=".pmtiles" onchange={pickFile} disabled={busy}>
  </label>
  {#if busy}
    <p class="status">Reading chart...</p>
  {:else if error}
    <p class="status error">{error}</p>
  {/if}
  <button type="button" class="cancel" onclick={onDone} disabled={busy}>Close</button>
</div>

<style>
.add-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-block: 0.4rem;
}
.url-row {
  display: flex;
  gap: 0.4rem;
}
.url {
  flex: 1;
  min-inline-size: 0;
  min-block-size: var(--control-size);
  padding-inline: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
}
.go,
.cancel {
  min-block-size: var(--control-size);
  padding-inline: 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.go:disabled,
.cancel:disabled {
  color: var(--text-muted);
  cursor: default;
}
.file {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.file input {
  font-size: var(--text-xs);
  color: var(--text);
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
