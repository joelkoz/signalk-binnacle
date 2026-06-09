<script lang="ts">
import { ArrowLeft, ChevronDown, ChevronUp, X } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { fly } from 'svelte/transition';
import { dialog } from './dialog';

// The panel slides in from the edge it docks to. Gated on the system reduced-motion preference
// (checked inline so this shell stays self-contained within shared/ui): a zero duration makes the
// reveal instant, so a helm with reduce-motion set sees no movement.
const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

interface Props {
  // The panel heading, and the default accessible name for the panel landmark.
  title: string;
  ariaLabel?: string;
  dock?: 'left' | 'right';
  // Lay the body out as a gapped column, for panels whose content is a stack of controls.
  bodyFlex?: boolean;
  closeLabel?: string;
  onClose: () => void;
  // When supplied, a leading back button returns to the menu instead of dismissing to the chart, so
  // the navigator can move menu to panel to menu to another panel without reopening the hamburger.
  // Panels opened from the chart (the note detail) omit it, so no back arrow renders.
  onBack?: () => void;
  backLabel?: string;
  // Optional extra header content, between the title and the close button.
  headerExtra?: Snippet;
  // When supplied, a minimize control collapses the panel to just its header on a phone, so the panel
  // does not cover the chart (for example while tapping waypoints into a route). It is a no-op on a
  // desktop side panel, so the control only shows at phone widths.
  minimized?: boolean;
  onToggleMinimize?: () => void;
  children: Snippet;
}

const {
  title,
  ariaLabel,
  dock = 'left',
  bodyFlex = false,
  closeLabel = 'Close',
  onClose,
  onBack,
  backLabel = 'Back to menu',
  headerExtra,
  minimized = false,
  onToggleMinimize,
  children,
}: Props = $props();
</script>

<aside
  class="slide-over slide-over--dock-{dock}"
  aria-label={ariaLabel ?? title}
  use:dialog={onClose}
  transition:fly={{ x: dock === 'right' ? 24 : -24, duration: reduceMotion ? 0 : 180, opacity: 0.3 }}
>
  <header class="panel-header">
    {#if onBack}
      <button
        type="button"
        class="icon-btn icon-btn--accent"
        aria-label={backLabel}
        title={backLabel}
        onclick={onBack}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
    {/if}
    <h2 class="panel-title">{title}</h2>
    {@render headerExtra?.()}
    {#if onToggleMinimize}
      <button
        type="button"
        class="panel-minimize"
        aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
        aria-pressed={minimized}
        title={minimized ? 'Expand panel' : 'Minimize panel'}
        onclick={onToggleMinimize}
      >
        {#if minimized}
          <ChevronUp size={18} aria-hidden="true" />
        {:else}
          <ChevronDown size={18} aria-hidden="true" />
        {/if}
      </button>
    {/if}
    <button
      type="button"
      class="panel-close"
      aria-label={closeLabel}
      title={closeLabel}
      onclick={onClose}
    >
      <X size={18} aria-hidden="true" />
    </button>
  </header>
  <div class="panel-body" class:panel-body--flex={bodyFlex} class:panel-body--collapsed={minimized}>
    {@render children()}
  </div>
</aside>
