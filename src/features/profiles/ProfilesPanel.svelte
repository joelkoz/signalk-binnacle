<script lang="ts">
import { Check, Save, SquarePen, Star, Trash2 } from '@lucide/svelte';
import type { Profile } from '$entities/profile';
import { promptSaveName, SlideOver } from '$shared/ui';

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
  onClose,
  onBack,
}: Props = $props();

function promptNew(): void {
  const name = promptSaveName('Profile');
  if (name !== undefined) onSaveNew(name);
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
  </div>

  <div class="saved">
    <span class="caps-label">Saved profiles</span>
    {#if profiles.length === 0}
      <p class="empty">No profiles yet</p>
    {:else}
      <ul>
        {#each profiles as profile (profile.id)}
          {@const isActive = profile.id === activeId}
          {@const isDefault = profile.id === defaultId}
          <li class:active={isActive}>
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
                class="icon-btn icon-btn--danger"
                aria-label="Delete profile"
                title="Delete"
                onclick={() => onRemove(profile.id)}
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
/* The save button takes the full width of the controls row, matching the Routes panel's primary. */
.panel-controls .btn-primary {
  flex: 1;
}
/* The card list, name, and actions come from the global .saved system in app.css. Only the
   active-profile accent treatment and the secondary tags are profile-specific. */
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
/* A quiet caps-label tag marking the default profile, distinct from the filled accent "Active" pill. */
.tag {
  flex-shrink: 0;
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
.dirty {
  margin: 0;
  color: var(--text-muted);
}
</style>
