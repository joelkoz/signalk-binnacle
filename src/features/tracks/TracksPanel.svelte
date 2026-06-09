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
import { formatDuration, formatKnots, formatNm, PLACEHOLDER } from '$shared/lib';
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

// Each saved track's distance and duration, formatted once per change. They ride on the SavedTrack as
// SI metadata saved with the geometry, so the card reads them without re-walking the points; a track
// saved without them shows the placeholder.
const savedCards = $derived(
  saved.map((track) => ({
    track,
    distanceNm: track.distanceMeters == null ? PLACEHOLDER : formatNm(track.distanceMeters),
    durationText:
      track.durationSeconds == null ? PLACEHOLDER : formatDuration(track.durationSeconds),
  })),
);

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

  <dl class="stat-grid">
    <dt>Distance</dt>
    <dd>
      <span class="num">{hasTrack ? formatNm(stats.distanceMeters) : PLACEHOLDER}</span>
      <span class="unit">nm</span>
    </dd>
    <dt>Duration</dt>
    <dd>
      <span class="num">{hasTrack ? formatDuration(stats.durationSeconds) : PLACEHOLDER}</span>
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
    <span class="caps-label">Saved tracks</span>
    {#if saved.length === 0}
      <p class="empty">None saved yet</p>
    {:else}
      <ul>
        {#each savedCards as { track, distanceNm, durationText } (track.id)}
          <li>
            <div class="card-head">
              <span class="name" title={track.name}>{track.name}</span>
            </div>
            <dl class="card-stats">
              <dt class="caps-label">Distance</dt>
              <dd>
                <span class="num">{distanceNm}</span>
                nm
              </dd>
              <dt class="caps-label">Duration</dt>
              <dd><span class="num">{durationText}</span></dd>
            </dl>
            <div class="actions">
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
            </div>
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
/* The current-track stats use the global .stat-grid system in app.css. */
/* The saved-track card list, name, stats, and actions come from the global .saved system in app.css. */
</style>
