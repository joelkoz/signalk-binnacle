<script lang="ts">
import { Download, Eraser, Eye, EyeOff, Pause, Play, Save, Trash2 } from '@lucide/svelte';
import type { TrackRecorder } from '$entities/track';
import { formatKnots, formatNm, PLACEHOLDER } from '$shared/lib';
import type { PersistedValue, TrackSettings } from '$shared/settings';
import { promptSaveName, SlideOver } from '$shared/ui';
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
  onClose: () => void;
}

const {
  recorder,
  settings,
  saved,
  shown,
  onSave,
  onDelete,
  onToggleSaved,
  onExport,
  onClose,
}: Props = $props();

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

function promptSave(): void {
  const name = promptSaveName('Track');
  if (name !== undefined) onSave(name);
}

function confirmClear(): void {
  if (window.confirm('Discard the current track? This cannot be undone.')) recorder.clear();
}

function setColorMode(mode: TrackSettings['colorMode']): void {
  settings.set({ ...settings.value, colorMode: mode });
}
</script>

<SlideOver title="Tracks" bodyFlex {onClose}>
  <div class="controls">
    {#if recorder.paused}
      <button type="button" class="btn" onclick={() => recorder.resume()}>
        <Play size={16} aria-hidden="true" />
        Resume
      </button>
    {:else}
      <button type="button" class="btn" onclick={() => recorder.pause()}>
        <Pause size={16} aria-hidden="true" />
        Pause
      </button>
    {/if}
    <button
      type="button"
      class="btn btn-primary"
      onclick={promptSave}
      disabled={recorder.points.length < 2}
    >
      <Save size={16} aria-hidden="true" />
      Save
    </button>
    <button
      type="button"
      class="btn btn-danger"
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
      aria-pressed={colorMode === 'speed'}
      onclick={() => setColorMode('speed')}
    >
      Speed
    </button>
    <button
      type="button"
      class:active={colorMode === 'solid'}
      aria-pressed={colorMode === 'solid'}
      onclick={() => setColorMode('solid')}
    >
      Solid
    </button>
  </div>

  <dl class="stats">
    <dt>Distance</dt>
    <dd><span class="num">{hasTrack ? formatNm(stats.distanceMeters) : PLACEHOLDER}</span> nm</dd>
    <dt>Duration</dt>
    <dd><span class="num">{hasTrack ? duration(stats.durationSeconds) : PLACEHOLDER}</span></dd>
    <dt>Avg</dt>
    <dd><span class="num">{hasTrack ? formatKnots(stats.avgSog) : PLACEHOLDER}</span> kn</dd>
    <dt>Max</dt>
    <dd><span class="num">{hasTrack ? formatKnots(stats.maxSog) : PLACEHOLDER}</span> kn</dd>
  </dl>

  <div class="saved">
    <span class="caps-label">Saved tracks</span>
    {#if saved.length === 0}
      <p class="empty">None saved yet</p>
    {:else}
      <ul>
        {#each saved as track (track.id)}
          <li>
            <span class="name" title={track.name}>{track.name}</span>
            <button
              type="button"
              class="icon-btn"
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
              class="icon-btn"
              aria-label="Export GeoJSON"
              title="Export GeoJSON"
              onclick={() => onExport(track)}
            >
              <Download size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-btn icon-btn--danger"
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
</SlideOver>

<style>
.controls {
  display: flex;
  gap: 0.35rem;
}
.color-mode {
  display: flex;
  gap: 0;
}
.color-mode button {
  flex: 1;
  min-block-size: var(--control-size);
  padding: 0.3rem var(--space-2);
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
/* Label and value in two columns, with every value left-aligned in a shared second column so the
   values line up on one left edge regardless of width. The unit follows each value inline. */
.stats {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  margin: 0;
}
.stats dt {
  color: var(--text-muted);
}
.stats dd {
  margin: 0;
  color: var(--text-muted);
}
.stats .num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text);
}
.saved {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
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
  gap: var(--space-1);
}
.saved .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
