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
  // A muted second heading line under the title, for panels whose subject needs a qualifier.
  subtitle?: string;
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
  // A pinned footer below the scrolling body, for panel-level actions or attribution.
  footer?: Snippet;
  // When supplied, a minimize control collapses the panel to just its header on a phone, so the panel
  // does not cover the chart (for example while tapping waypoints into a route). It is a no-op on a
  // desktop side panel, so the control only shows at phone widths. One object so the collapsed state
  // and its toggle are always supplied together.
  minimize?: { collapsed: boolean; onToggle: () => void };
  children: Snippet;
}

const {
  title,
  subtitle,
  ariaLabel,
  dock = 'left',
  bodyFlex = false,
  closeLabel = 'Close',
  onClose,
  onBack,
  backLabel = 'Back to menu',
  headerExtra,
  footer,
  minimize,
  children,
}: Props = $props();
</script>

<aside
  class="slide-over slide-over--dock-{dock}"
  aria-label={ariaLabel ?? title}
  tabindex="-1"
  use:dialog={onClose}
  transition:fly={{ x: dock === 'right' ? 24 : -24, duration: reduceMotion ? 0 : 180, opacity: 0.3 }}
>
  <header class="panel-header" class:panel-header--stacked={subtitle}>
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
    <div class="heading">
      <h2 class="panel-title">{title}</h2>
      {#if subtitle}
        <span class="subtitle">{subtitle}</span>
      {/if}
    </div>
    {@render headerExtra?.()}
    {#if minimize}
      <button
        type="button"
        class="panel-minimize"
        aria-label={minimize.collapsed ? 'Expand panel' : 'Minimize panel'}
        aria-pressed={minimize.collapsed}
        title={minimize.collapsed ? 'Expand panel' : 'Minimize panel'}
        onclick={minimize.onToggle}
      >
        {#if minimize.collapsed}
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
  <div
    class="panel-body"
    class:panel-body--flex={bodyFlex}
    class:panel-body--collapsed={minimize?.collapsed}
  >
    {@render children()}
  </div>
  {#if footer}
    <footer class="panel-footer">
      {@render footer()}
    </footer>
  {/if}
</aside>

<style>
.heading {
  flex: 1;
  min-inline-size: 0;
}
.subtitle {
  display: block;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
/* A two-line heading aligns to the top of the header instead of vertical center. */
.panel-header--stacked {
  align-items: flex-start;
}
.panel-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-xs);
}
</style>
