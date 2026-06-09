<script lang="ts">
import { Check, Download, Save, SquarePen, Star, Trash2, Upload } from '@lucide/svelte';
import type { Profile } from '$entities/profile';
import { pickTextFile, promptSaveName, SavedList, SlideOver } from '$shared/ui';

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

async function importProfiles(): Promise<void> {
  const text = await pickTextFile('.json,application/json');
  if (text !== undefined) onImport(text);
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
          onclick={() => onRemove(profile.id)}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
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
</style>
