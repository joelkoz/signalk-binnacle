<script lang="ts">
import { Eye, EyeOff, Navigation, Plus, Save, Square, SquarePen, Trash2, X } from '@lucide/svelte';
import { type Route, routeDistanceMeters } from '$entities/route';
import { formatNm } from '$shared/lib';
import { dialog, promptSaveName } from '$shared/ui';

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
  // Called with the name the user enters; the panel prompts for it via the shared promptSaveName.
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

function promptSave(): void {
  const name = promptSaveName('Route');
  if (name !== undefined) onSave(name);
}
</script>

<aside class="slide-over slide-over--dock-left" aria-label="Routes" use:dialog={onClose}>
  <header class="panel-header">
    <h2 class="panel-title">Routes</h2>
    <button
      type="button"
      class="panel-close"
      aria-label="Close routes panel"
      title="Close"
      onclick={onClose}
    >
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="panel-body panel-body--flex">
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="controls">
      <button
        type="button"
        class="btn btn-primary"
        onclick={onNew}
        disabled={working !== undefined}
      >
        <Plus size={16} aria-hidden="true" />
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
          <button
            type="button"
            class="btn btn-primary"
            onclick={promptSave}
            disabled={working.waypoints.length < 2}
          >
            <Save size={16} aria-hidden="true" />
            Save
          </button>
          <button type="button" class="btn" onclick={onCancelEdit}>
            <X size={16} aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>
    {/if}

    <div class="saved">
      <span class="caps-label">Saved routes</span>
      {#if routes.length === 0}
        <p class="empty">No routes yet</p>
      {:else}
        <ul>
          {#each routes as route (route.id)}
            <li class:active={route.id === activeId}>
              <div class="card-head">
                <button
                  type="button"
                  class="name"
                  title="Go to this route on the chart"
                  onclick={() => onLocate(route.id)}
                >
                  {route.name}
                </button>
                {#if route.id === activeId}
                  <span class="badge">Active</span>
                {/if}
              </div>
              <dl class="card-stats">
                <dt>Distance</dt>
                <dd>
                  <span class="num">{formatNm(routeDistanceMeters(route.waypoints))}</span>
                  nm
                </dd>
                <dt>Waypoints</dt>
                <dd><span class="num">{route.waypoints.length}</span></dd>
              </dl>
              <div class="actions">
                <button
                  type="button"
                  class="icon-btn"
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
                  class="icon-btn"
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
                    class="icon-btn icon-btn--accent"
                    aria-label="Stop navigation"
                    title="Stop navigation"
                    onclick={onStop}
                  >
                    <Square size={18} aria-hidden="true" />
                  </button>
                {:else}
                  <button
                    type="button"
                    class="icon-btn"
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
                  class="icon-btn icon-btn--danger"
                  aria-label="Delete route"
                  title="Delete"
                  onclick={() => onDelete(route.id)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</aside>

<style>
.controls {
  display: flex;
  gap: 0.35rem;
}
.controls .btn-primary {
  flex: 1;
}
.editing {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.6rem;
  border: 1px solid var(--accent);
  border-inline-start-width: 3px;
  border-radius: var(--radius-sm);
  background: var(--accent-tint);
  box-shadow: var(--shadow-overlay);
}
.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.error {
  margin: 0;
  padding: 0.4rem var(--space-2);
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
  column-gap: var(--space-2);
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  box-shadow: var(--shadow-overlay);
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast);
}
/* The active route is unmistakable: an accent left bar, an accent border, and a faint
   accent-tinted fill, so the navigator sees the live route at a glance in any theme. */
.saved li.active {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.saved li.active::before {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 3px;
  border-start-start-radius: var(--radius-sm);
  border-end-start-radius: var(--radius-sm);
  background: var(--accent);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.saved .name {
  flex: 1;
  display: flex;
  align-items: center;
  min-block-size: 1.6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-md);
  font-weight: 600;
  text-align: start;
  cursor: pointer;
  transition: color var(--transition-fast);
}
.saved .name:hover {
  color: var(--accent);
}
.badge {
  flex-shrink: 0;
  padding: 0.1rem var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--accent-tint-strong);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
/* The at-a-glance stats line. Mono, tabular numerals echo the NavStrip readouts so a saved
   card and the active-route strip read as one instrument family. */
.card-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) 0.8rem;
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.card-stats dt {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
.card-stats dd {
  margin: 0 0.4rem 0 0;
}
.card-stats .num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text);
}
.saved .actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
/* Push the destructive delete to the trailing edge so it is not flush against the safe
   actions and an accidental tap is less likely. */
.saved .actions .icon-btn--danger {
  margin-inline-start: auto;
}
</style>
