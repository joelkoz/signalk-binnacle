<script lang="ts">
import { Crosshair, Navigation, SquarePen, Trash2 } from '@lucide/svelte';
import type { Waypoint } from '$entities/waypoint';
import { formatLatitude, formatLongitude } from '$shared/lib';
import { InlineConfirm, promptRename, SavedList, SlideOver } from '$shared/ui';

interface Props {
  waypoints: Waypoint[];
  // A transient error to show (a failed save, rename, or delete), or undefined when clear.
  error: string | undefined;
  // Pan the chart to the waypoint without changing anything else.
  onLocate: (waypoint: Waypoint) => void;
  // Arm the Course API destination at this waypoint; the action renders only when provided.
  onGoTo?: (waypoint: Waypoint) => void;
  // Called with the new name the user enters; the panel prompts for it via the shared promptRename.
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onBack?: () => void;
}

const { waypoints, error, onLocate, onGoTo, onRename, onDelete, onClose, onBack }: Props = $props();

function rename(waypoint: Waypoint): void {
  const name = promptRename('Waypoint', waypoint.name);
  if (name !== undefined) onRename(waypoint.id, name);
}

// Deleting a waypoint is destructive, so it arms a confirm step rather than firing on a single
// tap where a mis-tap on a rolling deck would lose a saved mark.
let confirmingDelete = $state<string | undefined>();
function confirmDelete(id: string): void {
  confirmingDelete = undefined;
  onDelete(id);
}
</script>

<SlideOver title="Waypoints" bodyFlex {onClose} {onBack}>
  {#if error}
    <p class="alert-note" role="alert">{error}</p>
  {/if}

  <p class="muted-note">Drop waypoints from a long press on the chart.</p>

  <SavedList
    heading="Saved waypoints"
    items={waypoints}
    empty="No waypoints yet"
    key={(waypoint) => waypoint.id}
  >
    {#snippet card(waypoint)}
      <div class="card-head">
        <span class="name" title={waypoint.name}>{waypoint.name}</span>
      </div>
      <dl class="card-stats">
        <dt class="caps-label">Position</dt>
        <dd>
          <span class="num">
            {formatLatitude(waypoint.position.latitude)}
            {formatLongitude(waypoint.position.longitude)}
          </span>
        </dd>
      </dl>
      {#if waypoint.description}
        <p class="description">{waypoint.description}</p>
      {/if}
      {#if confirmingDelete === waypoint.id}
        <InlineConfirm
          question="Delete this waypoint?"
          onConfirm={() => confirmDelete(waypoint.id)}
          onCancel={() => (confirmingDelete = undefined)}
        />
      {:else}
        <div class="actions">
          <button
            type="button"
            class="icon-btn"
            aria-label="Show on chart"
            title="Show on chart"
            onclick={() => onLocate(waypoint)}
          >
            <Crosshair size={18} aria-hidden="true" />
          </button>
          {#if onGoTo}
            <button
              type="button"
              class="icon-btn"
              aria-label="Go to waypoint"
              title="Go to"
              onclick={() => onGoTo(waypoint)}
            >
              <Navigation size={18} aria-hidden="true" />
            </button>
          {/if}
          <button
            type="button"
            class="icon-btn"
            aria-label="Rename waypoint"
            title="Rename"
            onclick={() => rename(waypoint)}
          >
            <SquarePen size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn--danger"
            aria-label="Delete waypoint"
            title="Delete"
            onclick={() => (confirmingDelete = waypoint.id)}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      {/if}
    {/snippet}
  </SavedList>
</SlideOver>

<style>
/* The card list, wrapper, stats, and actions come from the shared SavedList plus the global .saved
   system in app.css; only the optional description line is Waypoints-specific. */
.description {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
</style>
