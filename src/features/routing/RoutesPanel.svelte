<script lang="ts">
import {
  ArrowLeftRight,
  Download,
  Navigation,
  Plus,
  Square,
  SquarePen,
  Trash2,
  Upload,
} from '@lucide/svelte';
import { type Route, type RouteHighlight, routeDistanceMeters } from '$entities/route';
import { formatNm } from '$shared/lib';
import type { PersistedValue } from '$shared/settings';
import { InlineConfirm, pickTextFile, SavedList, SlideOver, VisibilityToggle } from '$shared/ui';
import RouteDraftPanel from './RouteDraftPanel.svelte';
import RouteEditPlan from './RouteEditPlan.svelte';
import type { DraftView } from './route-draft-client';

interface Props {
  routes: Route[];
  shownIds: ReadonlySet<string>;
  // The route currently under edit on the chart, or undefined when not editing.
  working: Route | undefined;
  // The active (being navigated) route id, or undefined when none is active.
  activeId: string | undefined;
  // Which leg or waypoint of the working route is cross-highlighted, so the matching rows light up.
  highlight: RouteHighlight | undefined;
  // Tap a leg row to highlight it on the chart, and pan the chart to it when it is off-screen.
  onHighlightLeg: (index: number) => void;
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
  // AI route drafting: shown only when the route-drafting plugin is detected.
  draftAvailable: boolean;
  draftLoading: boolean;
  draftError: string | undefined;
  onDraft: (prompt: string) => void;
  // The active AI draft as display strings (the caller formats the fuel line and orders the flags),
  // or undefined for a hand-drawn working route. Its presence is what makes the route a draft.
  draft: DraftView | undefined;
  // Optimize the drawn route via the same plugin. Shown while editing a hand-drawn route.
  onOptimize: (hint: string) => void;
  // Restore the pre-optimize drawing instead of clearing, used by Cancel during an optimize draft.
  onCancelDraft: () => void;
  // True when the current draft came from Optimize, so Cancel restores rather than discards.
  optimizeDraft: boolean;
  // True when the last optimize returned an unchanged route, so the panel shows a brief note.
  optimizeUnchanged: boolean;
}

const {
  routes,
  shownIds,
  working,
  activeId,
  highlight,
  onHighlightLeg,
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
  draftAvailable,
  draftLoading,
  draftError,
  onDraft,
  draft,
  onOptimize,
  onCancelDraft,
  optimizeDraft,
  optimizeUnchanged,
}: Props = $props();

// Delete is destructive and, for the active route, also stops navigation, so it arms a confirm step
// rather than firing on a single tap where a mis-tap on a rolling deck would lose a saved route.
let confirmingDelete = $state<string | undefined>();
function confirmDelete(id: string): void {
  confirmingDelete = undefined;
  onDelete(id);
}

// A failed file read must not look like a quiet cancel: surface it so the navigator knows the import
// did not happen, not just that nothing changed.
let importError = $state<string | undefined>();

async function importGpx(): Promise<void> {
  const picked = await pickTextFile('.gpx,application/gpx+xml');
  if (!picked.ok) {
    importError = picked.reason === 'read-error' ? 'Could not read that file.' : undefined;
    return;
  }
  importError = undefined;
  onImportGpx(picked.text);
}

// Precompute each route's formatted distance once per change rather than re-walking every route's
// waypoints on every panel render inside the each-block.
const savedCards = $derived(
  routes.map((route) => ({ route, distanceNm: formatNm(routeDistanceMeters(route.waypoints)) })),
);

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

<!-- Disable minimize while a draft is shown: the draft warning and flag list are verification-critical and must not be collapsible. -->
<SlideOver
  title="Routes"
  bodyFlex
  closeLabel="Close routes panel"
  minimize={draft ? undefined : { collapsed: minimized, onToggle: () => (minimized = !minimized) }}
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

  {#if importError}
    <p class="alert-note" role="status">{importError}</p>
  {/if}

  <RouteDraftPanel
    {draftAvailable}
    {working}
    {draftLoading}
    {draftError}
    {draft}
    {optimizeDraft}
    {optimizeUnchanged}
    {onDraft}
    {onSave}
    {onOptimize}
    {onCancelDraft}
    {onCancelEdit}
  >
    {#snippet body()}
      {#if working}
        <RouteEditPlan {working} {highlight} {onHighlightLeg} {planningSpeed} />
      {/if}
      <p class="muted-note">
        Tap the chart to add waypoints. Drag a point to move it, tap a midpoint to insert one.
      </p>
    {/snippet}
  </RouteDraftPanel>

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
