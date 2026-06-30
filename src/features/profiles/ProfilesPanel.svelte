<script lang="ts">
import { Check, Download, Save, SquarePen, Star, Trash2, Upload } from '@lucide/svelte';
import type { Profile } from '$entities/profile';
import {
  InlineConfirm,
  pickTextFile,
  promptRename,
  promptSaveName,
  readErrorMessage,
  SavedList,
  SlideOver,
} from '$shared/ui';
import { type ImportedProfile, parseProfilesJson } from './profile-io';

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
  onImport: (profiles: ImportedProfile[]) => void;
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

// A parse error or a file with no valid entries must not fail silently: the panel parses once,
// says so when nothing was usable, and hands the already-parsed profiles to the importer.
let importError = $state<string | undefined>();

async function importProfiles(): Promise<void> {
  const picked = await pickTextFile('.json,application/json');
  if (!picked.ok) {
    importError = readErrorMessage(picked);
    return;
  }
  const parsed = parseProfilesJson(picked.text);
  if (parsed.length === 0) {
    importError = 'No valid profiles in that file.';
    return;
  }
  importError = undefined;
  onImport(parsed);
}

// Delete is destructive and propagates to every synced device, so it arms a confirm step rather
// than firing on a single tap, matching the Routes panel.
let confirmingDelete = $state<string | undefined>();
function confirmDelete(id: string): void {
  confirmingDelete = undefined;
  onRemove(id);
}

function renameProfile(profile: Profile): void {
  const name = promptRename('Profile', profile.name);
  if (name !== undefined) onRename(profile.id, name);
}
</script>

<SlideOver title="Profiles" bodyFlex closeLabel="Close profiles panel" {onClose} {onBack}>
  <div class="panel-controls">
    <button type="button" class="btn btn-primary btn--grow" onclick={promptNew}>
      <Save size={16} aria-hidden="true" />
      Save current as profile
    </button>
    <button type="button" class="btn" onclick={importProfiles}>
      <Upload size={16} aria-hidden="true" />
      Import JSON
    </button>
  </div>

  {#if importError}
    <p class="alert-note" role="alert">{importError}</p>
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
        <InlineConfirm
          question="Delete this profile on every synced device?"
          onConfirm={() => confirmDelete(profile.id)}
          onCancel={() => (confirmingDelete = undefined)}
        />
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
            onclick={() => renameProfile(profile)}
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
            aria-label="Export JSON"
            title="Export JSON"
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
/* The import error uses the global .alert-note rule; the armed delete confirm comes from the
   shared InlineConfirm component. */
</style>
