<script lang="ts">
import { Check, Download, Save, SquarePen, Star, Trash2, Upload } from '@lucide/svelte';
import type { Profile } from '$entities/profile';
import { focusOnMount, pickTextFile, promptSaveName, SavedList, SlideOver } from '$shared/ui';
import { parseProfilesJson } from './profile-io';

interface Props {
  profiles: Profile[];
  activeId: string | undefined;
  defaultId: string | undefined;
  isDirty: boolean;
  onApply: (id: string) => void;
  onSaveNew: (name: string) => void;
  onUpdate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
  // Download a profile as a JSON file, and import profiles from the text of a JSON file.
  onExport: (id: string) => void;
  onImport: (json: string) => void;
  onClose: () => void;
  onBack?: () => void;
}

const {
  profiles,
  activeId,
  defaultId,
  isDirty,
  onApply,
  onSaveNew,
  onUpdate,
  onRename,
  onRemove,
  onSetDefault,
  onExport,
  onImport,
  onClose,
  onBack,
}: Props = $props();

function promptNew(): void {
  const name = promptSaveName('Profile');
  if (name !== undefined) onSaveNew(name);
}

// A parse error or a file with no valid entries must not fail silently: validate here so the
// panel can say so, and hand only a usable document to the importer.
let importError = $state<string | undefined>();

async function importProfiles(): Promise<void> {
  const text = await pickTextFile('.json,application/json');
  if (text === undefined) return;
  if (parseProfilesJson(text).length === 0) {
    importError = 'No valid profiles in that file.';
    return;
  }
  importError = undefined;
  onImport(text);
}

// Delete is destructive and propagates to every synced device, so it arms a confirm step rather
// than firing on a single tap, matching the Routes panel.
let confirmingDelete = $state<string | undefined>();
function confirmDelete(id: string): void {
  confirmingDelete = undefined;
  onRemove(id);
}

function promptRename(profile: Profile): void {
  const name = window.prompt('Rename profile to', profile.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (trimmed) onRename(profile.id, trimmed);
}
</script>

<SlideOver title="Profiles" bodyFlex closeLabel="Close profiles panel" {onClose} {onBack}>
  <div class="panel-controls">
    <button type="button" class="btn btn-primary" onclick={promptNew}>
      <Save size={16} aria-hidden="true" />
      Save current as profile
    </button>
    <button type="button" class="btn" onclick={importProfiles}>
      <Upload size={16} aria-hidden="true" />
      Import
    </button>
  </div>

  {#if importError}
    <p class="error" role="status">{importError}</p>
  {/if}

  <SavedList
    heading="Saved profiles"
    items={profiles}
    empty="No profiles yet"
    key={(profile) => profile.id}
    isActive={(profile) => profile.id === activeId}
  >
    {#snippet card(profile)}
      {@const isActive = profile.id === activeId}
      {@const isDefault = profile.id === defaultId}
      <div class="card-head">
        <span class="name">{profile.name}</span>
        {#if isDefault}
          <span class="caps-label tag">Default</span>
        {/if}
        {#if isActive}
          <span class="badge">Active</span>
        {/if}
      </div>
      {#if isActive && isDirty}
        <p class="dirty caps-label">Unsaved changes</p>
      {/if}
      {#if confirmingDelete === profile.id}
        <div class="confirm" role="group" aria-label="Confirm delete profile">
          <span class="confirm-text">Delete this profile on every synced device?</span>
          <div class="confirm-actions">
            <button type="button" class="btn btn-danger" onclick={() => confirmDelete(profile.id)}>
              Delete
            </button>
            <button
              type="button"
              class="btn"
              use:focusOnMount
              onclick={() => (confirmingDelete = undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="actions">
          {#if !isActive}
            <button
              type="button"
              class="icon-btn"
              aria-label="Apply this profile"
              title="Apply"
              onclick={() => onApply(profile.id)}
            >
              <Check size={18} aria-hidden="true" />
            </button>
          {/if}
          {#if isActive}
            <button
              type="button"
              class="icon-btn"
              aria-label="Save changes to this profile"
              title="Save changes"
              disabled={!isDirty}
              onclick={() => onUpdate(profile.id)}
            >
              <Save size={18} aria-hidden="true" />
            </button>
          {/if}
          <button
            type="button"
            class="icon-btn"
            aria-label="Rename profile"
            title="Rename"
            onclick={() => promptRename(profile)}
          >
            <SquarePen size={18} aria-hidden="true" />
          </button>
          {#if !isDefault}
            <button
              type="button"
              class="icon-btn"
              aria-label="Set as default profile"
              title="Set as default"
              onclick={() => onSetDefault(profile.id)}
            >
              <Star size={18} aria-hidden="true" />
            </button>
          {/if}
          <button
            type="button"
            class="icon-btn"
            aria-label="Export profile as a file"
            title="Export"
            onclick={() => onExport(profile.id)}
          >
            <Download size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn--danger"
            aria-label="Delete profile"
            title="Delete"
            onclick={() => (confirmingDelete = profile.id)}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      {/if}
    {/snippet}
  </SavedList>
</SlideOver>

<style>
/* The save button takes the full width of the controls row, matching the Routes panel's primary. */
.panel-controls .btn-primary {
  flex: 1;
}
/* The card list, name, actions, the active-card accent treatment, and the "Active" badge all come from
   the shared .saved system in app.css. Only the default tag and the dirty note are profile-specific. */
/* A quiet caps-label tag marking the default profile, distinct from the filled accent "Active" pill. */
.tag {
  flex-shrink: 0;
  color: var(--accent);
}
.dirty {
  margin: 0;
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
/* The inline delete confirm replaces the action row for the armed card: a clear question and a pair
   of full buttons, so confirming or backing out is a deliberate second tap. */
.confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.confirm-text {
  font-size: var(--text-sm);
  font-weight: 600;
}
.confirm-actions {
  display: flex;
  gap: var(--space-2);
}
</style>
