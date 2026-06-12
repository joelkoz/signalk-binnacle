<script lang="ts">
import {
  ArrowLeftRight,
  Download,
  Navigation,
  Plus,
  Save,
  Square,
  SquarePen,
  Trash2,
  Upload,
  X,
} from '@lucide/svelte';
import { type Route, routeDistanceMeters, routeLegs } from '$entities/route';
import {
  formatBearingOr,
  formatDuration,
  formatNm,
  knotsToMetersPerSecond,
  PLACEHOLDER,
} from '$shared/lib';
import { etaSeconds } from '$shared/nav';
import type { PersistedValue } from '$shared/settings';
import {
  InlineConfirm,
  pickTextFile,
  promptSaveName,
  SavedList,
  SlideOver,
  UnitField,
  VisibilityToggle,
} from '$shared/ui';

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
  // Import routes from the text of a GPX file the user picked.
  onImportGpx: (gpxText: string) => void;
  // The planning speed (knots), persisted, that turns leg distances into per-waypoint passage times.
  planningSpeed: PersistedValue<number>;
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
  onImportGpx,
  planningSpeed,
  onDelete,
  onClose,
  onBack,
}: Props = $props();

function promptSave(): void {
  const name = promptSaveName('Route');
  if (name !== undefined) onSave(name);
}

// Delete is destructive and, for the active route, also stops navigation, so it arms a confirm step
// rather than firing on a single tap where a mis-tap on a rolling deck would lose a saved route.
let confirmingDelete = $state<string | undefined>();
function confirmDelete(id: string): void {
  confirmingDelete = undefined;
  onDelete(id);
}

async function importGpx(): Promise<void> {
  const text = await pickTextFile('.gpx,application/gpx+xml');
  if (text !== undefined) onImportGpx(text);
}

// Precompute each route's formatted distance once per change rather than re-walking every route's
// waypoints on every panel render inside the each-block.
const savedCards = $derived(
  routes.map((route) => ({ route, distanceNm: formatNm(routeDistanceMeters(route.waypoints)) })),
);
const planSpeedMps = $derived(knotsToMetersPerSecond(Math.max(0, planningSpeed.value || 0)));
// Each leg's distance, bearing, and the cumulative distance to reach that leg's end waypoint, so the
// plan reads as a leg table the way a navigator lays out a passage, updating live as waypoints are
// dragged or inserted. The per-leg passage times are layered on at render so this geometry walk does
// not re-run when only the planning speed changes.
const workingLegs = $derived.by(() => {
  let cumulativeMeters = 0;
  return routeLegs(working?.waypoints ?? []).map((leg) => {
    cumulativeMeters += leg.distanceMeters;
    return { ...leg, cumulativeMeters };
  });
});
// The whole-route distance is the last leg's cumulative, so the total and the table cannot drift.
const workingDistanceMeters = $derived(workingLegs.at(-1)?.cumulativeMeters ?? 0);
const workingDistanceNm = $derived(formatNm(workingDistanceMeters));
// The whole-passage time at the planning speed, shown alongside the total distance.
const totalTime = $derived.by(() => {
  const seconds = etaSeconds(workingDistanceMeters, planSpeedMps);
  return seconds == null ? PLACEHOLDER : formatDuration(seconds);
});

// Minimize collapses the panel to its header on a phone, so the chart is usable while waypoints are
// tapped in. Expand it whenever an edit begins, so the edit controls are visible before the navigator
// chooses to minimize; the transition check keeps a minimize during editing from springing back open
// on the next waypoint.
let minimized = $state(false);
let wasEditing = false;
$effect(() => {
  const editing = working !== undefined;
  if (editing && !wasEditing) minimized = false;
  wasEditing = editing;
});
</script>

<SlideOver
  title="Routes"
  bodyFlex
  closeLabel="Close routes panel"
  minimize={{ collapsed: minimized, onToggle: () => (minimized = !minimized) }}
  {onClose}
  {onBack}
>
  {#if error}
    <p class="alert-note" role="alert">{error}</p>
  {/if}

  <div class="panel-controls">
    <button
      type="button"
      class="btn btn-primary btn--grow"
      onclick={onNew}
      disabled={working !== undefined}
    >
      <Plus size={16} aria-hidden="true" />
      New route
    </button>
    <button type="button" class="btn" onclick={importGpx}>
      <Upload size={16} aria-hidden="true" />
      Import GPX
    </button>
  </div>

  {#if working}
    <div class="editing" role="group" aria-label="Route under edit">
      <dl class="stat-grid">
        <dt>Waypoints</dt>
        <dd><span class="num">{working.waypoints.length}</span></dd>
        <dt>Distance</dt>
        <dd>
          <span class="num">{workingDistanceNm}</span>
          <span class="unit">nm</span>
        </dd>
        <dt>Time</dt>
        <dd><span class="num">{totalTime}</span></dd>
      </dl>
      <UnitField
        label="Plan speed"
        unit="kn"
        value={planningSpeed.value}
        min={0}
        step={0.5}
        inputWidth="4rem"
        onCommit={(speed) => planningSpeed.set(Math.max(0, speed))}
      />
      {#if workingLegs.length > 0}
        <ol class="legs" aria-label="Legs">
          {#each workingLegs as leg (leg.fromIndex)}
            {@const seconds = etaSeconds(leg.cumulativeMeters, planSpeedMps)}
            <li>
              <span class="leg-no">{leg.fromIndex + 1}</span>
              <span class="leg-dist">{formatNm(leg.distanceMeters)} nm</span>
              <span class="leg-brg">{formatBearingOr(leg.bearingRad)}&deg;T</span>
              <span class="leg-time">
                {seconds == null ? PLACEHOLDER : formatDuration(seconds)}
              </span>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="muted-note">
        Tap the chart to add waypoints. Drag a point to move it, tap a midpoint to insert one.
      </p>
      <div class="panel-controls">
        <button
          type="button"
          class="btn btn-primary btn--grow"
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

  <SavedList
    heading="Saved routes"
    items={savedCards}
    empty="No routes yet"
    key={({ route }) => route.id}
    isActive={({ route }) => route.id === activeId}
  >
    {#snippet card({ route, distanceNm })}
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
      {#if confirmingDelete === route.id}
        <InlineConfirm
          question={route.id === activeId
            ? 'Delete this route and stop navigating?'
            : 'Delete this route?'}
          onConfirm={() => confirmDelete(route.id)}
          onCancel={() => (confirmingDelete = undefined)}
        />
      {:else}
        <div class="actions">
          <VisibilityToggle
            shown={shownIds.has(route.id)}
            onToggle={() => onToggleShown(route.id, !shownIds.has(route.id))}
          />
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
            onclick={() => (confirmingDelete = route.id)}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      {/if}
    {/snippet}
  </SavedList>
</SlideOver>

<style>
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
/* The leg-by-leg readout for the route under edit: a scrolling list of leg number, distance, bearing,
   and the cumulative passage time to reach that waypoint, mono and tabular so the columns line up. */
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
  grid-template-columns: 1.5rem 1fr auto auto;
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
.leg-time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  text-align: end;
}
/* The inline alarm note and the armed delete confirm come from the global .alert-note rule and the
   shared InlineConfirm component. */
/* The route-edit working-plan stats use the global .stat-grid system in app.css. */
/* The card list, wrapper, stats, and actions come from the shared SavedList plus the global .saved
   system in app.css. The .saved wrapper lives in SavedList, so the ancestor is matched with :global
   while the .name and .card-stats elements stay scoped to this panel's card snippet. Only the
   active-route accent treatment and the name's locate interactivity are Routes-specific. */
:global(.saved) .name {
  cursor: pointer;
  transition: color var(--transition-fast);
}
:global(.saved) .name:hover {
  color: var(--accent);
}
/* The active-card accent bar, fill, and the "Active" badge are the shared .saved system in app.css. */
/* On the active card (its background is the accent tint), lift the muted stat labels to the body text
   color so they stay readable, especially in night-red where muted-on-tint is the lowest-contrast
   pairing. This raises contrast with the body color already in use, not a brighter one. */
:global(.saved li.active) .card-stats {
  color: var(--text);
}
</style>
