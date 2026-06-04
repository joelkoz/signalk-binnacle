<script lang="ts">
import { Download, Eraser, Eye, EyeOff, Pause, Play, Save, Trash2 } from '@lucide/svelte';
import type { TrackRecorder } from '$entities/track';
import { formatKnots, formatNm, PLACEHOLDER } from '$shared/lib';
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
// Until the track has captured a point, its stats are absent, not zero, so show the placeholder.
const hasTrack = $derived(recorder.points.length > 0);

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

<section class="tracks" aria-label="Tracks">
  <div class="controls">
    {#if recorder.paused}
      <button type="button" onclick={() => recorder.resume()}>
        <Play size={16} aria-hidden="true" />
        Resume
      </button>
    {:else}
      <button type="button" onclick={() => recorder.pause()}>
        <Pause size={16} aria-hidden="true" />
        Pause
      </button>
    {/if}
    <button
      type="button"
      class="primary"
      onclick={promptSave}
      disabled={recorder.points.length < 2}
    >
      <Save size={16} aria-hidden="true" />
      Save
    </button>
    <button
      type="button"
      class="danger"
      onclick={confirmClear}
      disabled={recorder.points.length === 0}
    >
      <Eraser size={16} aria-hidden="true" />
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
    <dt>Distance</dt>
    <dd>
      <span class="num">{hasTrack ? formatNm(stats.distanceMeters) : PLACEHOLDER}</span>
      <span class="unit">nm</span>
    </dd>
    <dt>Duration</dt>
    <dd>
      <span class="num">{hasTrack ? duration(stats.durationSeconds) : PLACEHOLDER}</span>
      <span class="unit"></span>
    </dd>
    <dt>Avg</dt>
    <dd>
      <span class="num">{hasTrack ? formatKnots(stats.avgSog) : PLACEHOLDER}</span>
      <span class="unit">kn</span>
    </dd>
    <dt>Max</dt>
    <dd>
      <span class="num">{hasTrack ? formatKnots(stats.maxSog) : PLACEHOLDER}</span>
      <span class="unit">kn</span>
    </dd>
  </dl>

  <div class="saved">
    <span class="saved-title">Saved tracks</span>
    {#if saved.length === 0}
      <p class="empty">None saved yet</p>
    {:else}
      <ul>
        {#each saved as track (track.id)}
          <li>
            <span class="name" title={track.name}>{track.name}</span>
            <button
              type="button"
              class="icon"
              aria-pressed={shown.has(track.id)}
              aria-label={shown.has(track.id) ? 'Hide on chart' : 'Show on chart'}
              title={shown.has(track.id) ? 'Hide on chart' : 'Show on chart'}
              onclick={() => onToggleSaved(track.id)}
            >
              {#if shown.has(track.id)}
                <Eye size={18} aria-hidden="true" />
              {:else}
                <EyeOff size={18} aria-hidden="true" />
              {/if}
            </button>
            <button
              type="button"
              class="icon"
              aria-label="Export GeoJSON"
              title="Export GeoJSON"
              onclick={() => onExport(track)}
            >
              <Download size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon danger"
              aria-label="Delete track"
              title="Delete"
              onclick={() => onDelete(track.id)}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
.tracks {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: var(--text-base);
}
.controls {
  display: flex;
  gap: 0.35rem;
}
.controls button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--control-size);
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.controls button:hover:not(:disabled) {
  border-color: var(--accent);
}
.controls button:disabled {
  opacity: var(--disabled-opacity);
  cursor: not-allowed;
}
.controls button.danger {
  color: var(--alarm);
}
.controls button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  box-shadow: var(--shadow-overlay);
}
.controls button.primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
.color-mode {
  display: flex;
  gap: 0;
}
.color-mode button {
  flex: 1;
  min-block-size: var(--control-size);
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.color-mode button:first-child {
  border-start-start-radius: var(--radius-sm);
  border-end-start-radius: var(--radius-sm);
}
.color-mode button:last-child {
  border-start-end-radius: var(--radius-sm);
  border-end-end-radius: var(--radius-sm);
  border-inline-start: 0;
}
.color-mode button.active {
  background: var(--surface-raised);
  color: var(--accent);
  border-color: var(--accent);
}
/* One grid for the whole list (label, number, unit) so every number shares a column and
   every unit shares a column. The dd is display: contents so its number and unit become
   direct grid items; a row with no unit (Duration) leaves a blank unit cell without
   nudging the number out of the shared column. */
.stats {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  column-gap: 0.5rem;
  row-gap: 0.3rem;
  margin: 0;
}
.stats dt {
  color: var(--text-muted);
}
.stats dd {
  display: contents;
}
.stats .num {
  text-align: end;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text);
}
.stats .unit {
  min-inline-size: 1.25rem;
  color: var(--text-muted);
  font-size: var(--text-xs);
}
.saved {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.saved-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.empty {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.saved ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
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
  align-items: center;
  justify-content: center;
  min-block-size: var(--control-size);
  min-inline-size: var(--control-size);
  padding: 0.25rem;
  border: 0;
  border-radius: var(--radius-sm);
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
