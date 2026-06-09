<script lang="ts">
import {
  Download,
  Eraser,
  Eye,
  EyeOff,
  Pause,
  Play,
  Route,
  Save,
  Trash2,
  Undo2,
} from '@lucide/svelte';
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
  // Save the current track as a reusable route, and navigate back along it (retrace home).
  onSaveAsRoute: (name: string) => void;
  onTrackHome: () => void;
  onDelete: (id: string) => void;
  onToggleSaved: (id: string) => void;
  onExport: (track: SavedTrack) => void;
  onClose: () => void;
  onBack?: () => void;
}

const {
  recorder,
  settings,
  saved,
  shown,
  onSave,
  onSaveAsRoute,
  onTrackHome,
  onDelete,
  onToggleSaved,
  onExport,
  onClose,
  onBack,
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

function promptSaveAsRoute(): void {
  const name = promptSaveName('Route');
  if (name !== undefined) onSaveAsRoute(name);
}

function confirmClear(): void {
  if (window.confirm('Discard the current track? This cannot be undone.')) recorder.clear();
}

function setColorMode(mode: TrackSettings['colorMode']): void {
  settings.set({ ...settings.value, colorMode: mode });
}
</script>

<SlideOver title="Tracks" bodyFlex {onClose} {onBack}>
  <div class="panel-controls">
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
      class="btn"
      class:is-on={colorMode === 'speed'}
      aria-pressed={colorMode === 'speed'}
      onclick={() => setColorMode('speed')}
    >
      Speed
    </button>
    <button
      type="button"
      class="btn"
      class:is-on={colorMode === 'solid'}
      aria-pressed={colorMode === 'solid'}
      onclick={() => setColorMode('solid')}
    >
      Solid
    </button>
  </div>

  <div class="panel-controls">
    <button
      type="button"
      class="btn"
      onclick={promptSaveAsRoute}
      disabled={recorder.points.length < 2}
    >
      <Route size={16} aria-hidden="true" />
      Save as route
    </button>
    <button type="button" class="btn" onclick={onTrackHome} disabled={recorder.points.length < 2}>
      <Undo2 size={16} aria-hidden="true" />
      Navigate home
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
/* A segmented toggle built from the shared .btn box, so the lit segment uses the global .is-on
   accent-tint state every other toggle shares. Only the segment-join (collapsed inner border and
   squared inner corners) and the off-segment quiet fill are local. */
.color-mode {
  display: flex;
  gap: 0;
}
.color-mode .btn {
  flex: 1;
}
.color-mode .btn:not(.is-on) {
  background: transparent;
  color: var(--text-muted);
}
.color-mode .btn:first-child {
  border-start-end-radius: 0;
  border-end-end-radius: 0;
}
.color-mode .btn:last-child {
  border-start-start-radius: 0;
  border-end-start-radius: 0;
  border-inline-start: 0;
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
/* The action buttons keep their size; the name absorbs all the shrink and ellipsizes. */
.saved li .icon-btn {
  flex-shrink: 0;
}
.saved .name {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
