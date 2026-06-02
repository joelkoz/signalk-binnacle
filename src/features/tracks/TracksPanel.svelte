<script lang="ts">
import { Download, Eraser, Eye, EyeOff, Pause, Play, Save, Trash2 } from '@lucide/svelte';
import type { TrackRecorder } from '$entities/track';
import { formatCpaNm, metersPerSecondToKnots } from '$shared/lib';
import type { PersistedValue, TrackSettings } from '$shared/settings';
import type { SavedTrack } from './tracks-client';

interface Props {
  recorder: TrackRecorder;
  settings: PersistedValue<TrackSettings>;
  saved: SavedTrack[];
  shown: ReadonlySet<string>;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onToggleSaved: (id: string) => void;
  onExport: (track: SavedTrack) => void;
}

const { recorder, settings, saved, shown, onSave, onDelete, onToggleSaved, onExport }: Props =
  $props();

const stats = $derived(recorder.stats);
const colorMode = $derived(settings.value.colorMode);

function knots(metersPerSecond: number): string {
  return (metersPerSecondToKnots(metersPerSecond) ?? 0).toFixed(1);
}

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function defaultName(): string {
  return `Track ${new Date().toISOString().slice(0, 10)}`;
}

function promptSave(): void {
  const name = window.prompt('Save track as', defaultName());
  if (name === null) return;
  onSave(name.trim() || defaultName());
}

function confirmClear(): void {
  if (window.confirm('Discard the current track? This cannot be undone.')) recorder.clear();
}

function setColorMode(mode: TrackSettings['colorMode']): void {
  settings.set({ ...settings.value, colorMode: mode });
}
</script>

<div class="tracks" aria-label="Tracks">
  <div class="controls">
    {#if recorder.paused}
      <button type="button" onclick={() => recorder.resume()}>
        <Play size={15} aria-hidden="true" />
        Resume
      </button>
    {:else}
      <button type="button" onclick={() => recorder.pause()}>
        <Pause size={15} aria-hidden="true" />
        Pause
      </button>
    {/if}
    <button type="button" onclick={promptSave} disabled={recorder.points.length < 2}>
      <Save size={15} aria-hidden="true" />
      Save
    </button>
    <button
      type="button"
      class="danger"
      onclick={confirmClear}
      disabled={recorder.points.length === 0}
    >
      <Eraser size={15} aria-hidden="true" />
      Clear
    </button>
  </div>

  <div class="color-mode" role="group" aria-label="Track color">
    <button
      type="button"
      class:active={colorMode === 'speed'}
      onclick={() => setColorMode('speed')}
    >
      Speed
    </button>
    <button
      type="button"
      class:active={colorMode === 'solid'}
      onclick={() => setColorMode('solid')}
    >
      Solid
    </button>
  </div>

  <dl class="stats">
    <div>
      <dt>Distance</dt>
      <dd>{formatCpaNm(stats.distanceMeters)} nm</dd>
    </div>
    <div>
      <dt>Duration</dt>
      <dd>{duration(stats.durationSeconds)}</dd>
    </div>
    <div>
      <dt>Avg</dt>
      <dd>{knots(stats.avgSog)} kn</dd>
    </div>
    <div>
      <dt>Max</dt>
      <dd>{knots(stats.maxSog)} kn</dd>
    </div>
  </dl>

  <div class="saved">
    <span class="saved-title">Saved tracks</span>
    {#if saved.length === 0}
      <p class="empty">None saved yet.</p>
    {:else}
      <ul>
        {#each saved as track (track.id)}
          <li>
            <span class="name" title={track.name}>{track.name}</span>
            <button
              type="button"
              class="icon"
              aria-pressed={shown.has(track.id)}
              title={shown.has(track.id) ? 'Hide on chart' : 'Show on chart'}
              onclick={() => onToggleSaved(track.id)}
            >
              {#if shown.has(track.id)}
                <Eye size={15} aria-hidden="true" />
              {:else}
                <EyeOff size={15} aria-hidden="true" />
              {/if}
            </button>
            <button
              type="button"
              class="icon"
              title="Export GeoJSON"
              onclick={() => onExport(track)}
            >
              <Download size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon danger"
              title="Delete"
              onclick={() => onDelete(track.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
.tracks {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 0.85rem;
}
.controls {
  display: flex;
  gap: 0.35rem;
}
.controls button {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.3rem;
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.controls button:hover:not(:disabled) {
  border-color: var(--accent);
}
.controls button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.controls button.danger {
  color: var(--alarm);
}
.color-mode {
  display: flex;
  gap: 0;
}
.color-mode button {
  flex: 1;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.color-mode button:first-child {
  border-start-start-radius: 0.3rem;
  border-end-start-radius: 0.3rem;
}
.color-mode button:last-child {
  border-start-end-radius: 0.3rem;
  border-end-end-radius: 0.3rem;
  border-inline-start: 0;
}
.color-mode button.active {
  background: var(--surface-raised);
  color: var(--accent);
  border-color: var(--accent);
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem 0.6rem;
  margin: 0;
}
.stats div {
  display: flex;
  justify-content: space-between;
}
.stats dt {
  color: var(--text-muted);
}
.stats dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.saved {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.saved-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}
.saved ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.saved li {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.saved .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon {
  display: inline-flex;
  padding: 0.25rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.icon:hover {
  background: var(--surface);
  color: var(--text);
}
.icon[aria-pressed="true"] {
  color: var(--accent);
}
.icon.danger:hover {
  color: var(--alarm);
}
</style>
