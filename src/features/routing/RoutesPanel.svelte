<script lang="ts">
import {
  ArrowLeftRight,
  Download,
  Eye,
  EyeOff,
  Navigation,
  Plus,
  Save,
  Square,
  SquarePen,
  Trash2,
  X,
} from '@lucide/svelte';
import { type Route, routeDistanceMeters, routeLegs } from '$entities/route';
import { formatBearingOr, formatNm } from '$shared/lib';
import { promptSaveName, SlideOver } from '$shared/ui';

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
  // Save a reversed copy of the route, for the return leg.
  onReverse: (id: string) => void;
  // Download the route as a GPX file for another plotter or MFD.
  onExportGpx: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onBack?: () => void;
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
  onReverse,
  onExportGpx,
  onDelete,
  onClose,
  onBack,
}: Props = $props();

function promptSave(): void {
  const name = promptSaveName('Route');
  if (name !== undefined) onSave(name);
}

// Precompute each route's formatted distance once per change rather than re-walking every route's
// waypoints on every panel render inside the each-block.
const savedCards = $derived(
  routes.map((route) => ({ route, distanceNm: formatNm(routeDistanceMeters(route.waypoints)) })),
);
const workingDistanceNm = $derived(working ? formatNm(routeDistanceMeters(working.waypoints)) : '');
// Each leg's distance and bearing for the route under edit, so the plan reads as a leg table the way
// a navigator lays out a passage, updating live as waypoints are dragged or inserted.
const workingLegs = $derived(working ? routeLegs(working.waypoints) : []);
</script>

<SlideOver title="Routes" bodyFlex closeLabel="Close routes panel" {onClose} {onBack}>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="panel-controls">
    <button type="button" class="btn btn-primary" onclick={onNew} disabled={working !== undefined}>
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
          <span class="num">{workingDistanceNm}</span>
          <span class="unit">nm</span>
        </dd>
      </dl>
      {#if workingLegs.length > 0}
        <ol class="legs" aria-label="Legs">
          {#each workingLegs as leg (leg.fromIndex)}
            <li>
              <span class="leg-no">{leg.fromIndex + 1}</span>
              <span class="leg-dist">{formatNm(leg.distanceMeters)} nm</span>
              <span class="leg-brg">{formatBearingOr(leg.bearingRad)}&deg;T</span>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="hint">
        Tap the chart to add waypoints. Drag a point to move it, tap a midpoint to insert one.
      </p>
      <div class="panel-controls">
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
        {#each savedCards as { route, distanceNm } (route.id)}
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
              <dt class="caps-label">Distance</dt>
              <dd>
                <span class="num">{distanceNm}</span>
                nm
              </dd>
              <dt class="caps-label">Waypoints</dt>
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
              <button
                type="button"
                class="icon-btn"
                aria-label="Reverse route"
                title="Save a reversed copy"
                onclick={() => onReverse(route.id)}
              >
                <ArrowLeftRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                class="icon-btn"
                aria-label="Export route as GPX"
                title="Export GPX"
                onclick={() => onExportGpx(route.id)}
              >
                <Download size={18} aria-hidden="true" />
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
</SlideOver>

<style>
/* The row layout comes from the shared .panel-controls; New route and Save take the full width. */
.panel-controls .btn-primary {
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
/* The leg-by-leg readout for the route under edit: a scrolling list of leg number, distance, and
   bearing, mono and tabular so the columns line up. */
.legs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  max-block-size: 9rem;
  overflow-y: auto;
  font-size: var(--text-sm);
}
.legs li {
  display: grid;
  grid-template-columns: 1.5rem 1fr auto;
  gap: var(--space-2);
  align-items: baseline;
}
.leg-no {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.leg-dist {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.leg-brg {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
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
  /* Fill the card-head row so the locate target is a full 44px tall, not a 26px sliver. */
  min-block-size: var(--control-size);
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
.card-stats dd {
  margin: 0 0.4rem 0 0;
}
/* The mono, tabular readout shared by the active-route strip stats and the saved-card stats. */
.stats .num,
.card-stats .num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text);
}
/* On the active card (its background is the accent tint), lift the muted stat labels to the body text
   color so they stay readable, especially in night-red where muted-on-tint is the lowest-contrast
   pairing. This raises contrast with the body color already in use, not a brighter one. */
.saved li.active .card-stats {
  color: var(--text);
}
.saved .actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
}
/* Push the destructive delete to the trailing edge so it is not flush against the safe
   actions and an accidental tap is less likely. */
.saved .actions .icon-btn--danger {
  margin-inline-start: auto;
}
</style>
