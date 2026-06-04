<script lang="ts">
import { Eye, EyeOff, Navigation, Plus, Save, Square, SquarePen, Trash2, X } from '@lucide/svelte';
import { type Route, routeDistanceMeters } from '$entities/route';
import { formatNm } from '$shared/lib';

interface Props {
  routes: Route[];
  shownIds: ReadonlySet<string>;
  // The route currently under edit on the chart, or undefined when not editing.
  working: Route | undefined;
  // The active (being navigated) route id, or undefined when none is active.
  activeId: string | undefined;
  // A transient error to show (a failed save, activate, stop, or delete), or undefined when clear.
  error: string | undefined;
  onNew: () => void;
  onEditRoute: (id: string) => void;
  // Called with the name the user enters; the panel prompts for it (mirror TracksPanel.promptSave).
  onSave: (name: string) => void;
  onCancelEdit: () => void;
  onToggleShown: (id: string, shown: boolean) => void;
  // Pan the chart to a route's start without changing its shown state.
  onLocate: (id: string) => void;
  onActivate: (id: string) => void;
  onStop: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const {
  routes,
  shownIds,
  working,
  activeId,
  error,
  onNew,
  onEditRoute,
  onSave,
  onCancelEdit,
  onToggleShown,
  onLocate,
  onActivate,
  onStop,
  onDelete,
  onClose,
}: Props = $props();

function defaultName(): string {
  return `Route ${new Date().toISOString().slice(0, 10)}`;
}

function promptSave(): void {
  const name = window.prompt('Save route as', defaultName());
  if (name === null) return;
  onSave(name.trim() || defaultName());
}
</script>

<div class="routes" aria-label="Routes">
  <div class="panel-head">
    <span class="panel-title">Routes</span>
    <button
      type="button"
      class="close"
      aria-label="Close routes panel"
      title="Close"
      onclick={onClose}
    >
      <X size={18} aria-hidden="true" />
    </button>
  </div>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="controls">
    <button type="button" onclick={onNew} disabled={working !== undefined}>
      <Plus size={15} aria-hidden="true" />
      New route
    </button>
  </div>

  {#if working}
    <div class="editing" role="group" aria-label="Route under edit">
      <dl class="stats">
        <dt>Waypoints</dt>
        <dd><span class="num">{working.waypoints.length}</span><span class="unit"></span></dd>
        <dt>Distance</dt>
        <dd>
          <span class="num">{formatNm(routeDistanceMeters(working.waypoints))}</span>
          <span class="unit">nm</span>
        </dd>
      </dl>
      <p class="hint">
        Tap the chart to add waypoints. Drag a point to move it, tap a midpoint to insert one.
      </p>
      <div class="controls">
        <button type="button" onclick={promptSave} disabled={working.waypoints.length < 2}>
          <Save size={15} aria-hidden="true" />
          Save
        </button>
        <button type="button" onclick={onCancelEdit}>
          <X size={15} aria-hidden="true" />
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <div class="saved">
    <span class="saved-title">Saved routes</span>
    {#if routes.length === 0}
      <p class="empty">No routes yet.</p>
    {:else}
      <ul>
        {#each routes as route (route.id)}
          <li>
            <button
              type="button"
              class="name"
              title="Go to this route on the chart"
              onclick={() => onLocate(route.id)}
            >
              {route.name}
            </button>
            <button
              type="button"
              class="icon"
              aria-pressed={shownIds.has(route.id)}
              aria-label={shownIds.has(route.id) ? 'Hide on chart' : 'Show on chart'}
              title={shownIds.has(route.id) ? 'Hide on chart' : 'Show on chart'}
              onclick={() => onToggleShown(route.id, !shownIds.has(route.id))}
            >
              {#if shownIds.has(route.id)}
                <Eye size={18} aria-hidden="true" />
              {:else}
                <EyeOff size={18} aria-hidden="true" />
              {/if}
            </button>
            <button
              type="button"
              class="icon"
              aria-label="Edit route"
              title="Edit"
              disabled={working !== undefined}
              onclick={() => onEditRoute(route.id)}
            >
              <SquarePen size={18} aria-hidden="true" />
            </button>
            {#if route.id === activeId}
              <button
                type="button"
                class="icon active"
                aria-label="Stop navigation"
                title="Stop navigation"
                onclick={onStop}
              >
                <Square size={18} aria-hidden="true" />
              </button>
            {:else}
              <button
                type="button"
                class="icon"
                aria-label="Activate route"
                title="Activate route"
                disabled={working !== undefined}
                onclick={() => onActivate(route.id)}
              >
                <Navigation size={18} aria-hidden="true" />
              </button>
            {/if}
            <button
              type="button"
              class="icon danger"
              aria-label="Delete route"
              title="Delete"
              onclick={() => onDelete(route.id)}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
.routes {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: var(--text-base);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.close {
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
.close:hover {
  background: var(--surface);
  color: var(--text);
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
.editing {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.error {
  margin: 0;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--alarm);
  border-radius: var(--radius-sm);
  color: var(--alarm);
  font-size: var(--text-sm);
}
/* One grid for the whole list (label, number, unit) so every number shares a column and
   every unit shares a column. The dd is display: contents so its number and unit become
   direct grid items; a row with no unit (Waypoints) leaves a blank unit cell without
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
  font-variant-numeric: tabular-nums;
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
  display: flex;
  align-items: center;
  min-block-size: var(--control-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.saved .name:hover {
  color: var(--accent);
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
.icon:disabled {
  opacity: var(--disabled-opacity);
  cursor: not-allowed;
}
.icon[aria-pressed="true"] {
  color: var(--accent);
}
.icon.active {
  color: var(--accent);
}
.icon.danger:hover {
  color: var(--alarm);
}
</style>
