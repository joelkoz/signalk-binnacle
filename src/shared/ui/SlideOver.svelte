<script lang="ts">
import { X } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { dialog } from './dialog';

interface Props {
  // The panel heading, and the default accessible name for the panel landmark.
  title: string;
  ariaLabel?: string;
  dock?: 'left' | 'right';
  // Lay the body out as a gapped column, for panels whose content is a stack of controls.
  bodyFlex?: boolean;
  closeLabel?: string;
  onClose: () => void;
  // Optional extra header content, between the title and the close button.
  headerExtra?: Snippet;
  children: Snippet;
}

const {
  title,
  ariaLabel,
  dock = 'left',
  bodyFlex = false,
  closeLabel = 'Close',
  onClose,
  headerExtra,
  children,
}: Props = $props();
</script>

<aside
  class="slide-over slide-over--dock-{dock}"
  aria-label={ariaLabel ?? title}
  use:dialog={onClose}
>
  <header class="panel-header">
    <h2 class="panel-title">{title}</h2>
    {@render headerExtra?.()}
    <button
      type="button"
      class="panel-close"
      aria-label={closeLabel}
      title="Close"
      onclick={onClose}
    >
      <X size={18} aria-hidden="true" />
    </button>
  </header>
  <div class="panel-body" class:panel-body--flex={bodyFlex}>
    {@render children()}
  </div>
</aside>
