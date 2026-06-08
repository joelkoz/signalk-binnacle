<script lang="ts">
import { Moon, Sun, Sunset } from '@lucide/svelte';
import type { Component } from 'svelte';
import { scale } from 'svelte/transition';
import { prefersReducedMotion } from '$shared/lib';
import type { Theme, ThemeController } from '$shared/ui';

interface Props {
  controller: ThemeController;
}

const { controller }: Props = $props();

const ICONS: Record<Theme, Component> = {
  day: Sun,
  dusk: Sunset,
  'night-red': Moon,
};

const LABELS: Record<Theme, string> = {
  day: 'Day theme',
  dusk: 'Dusk theme',
  'night-red': 'Night theme',
};

const Icon = $derived(ICONS[controller.theme]);
const label = $derived(LABELS[controller.theme]);
</script>

<button
  type="button"
  class="icon-pill"
  aria-label={`Switch theme (currently ${label})`}
  title={label}
  onclick={() => controller.cycle()}
>
  <!-- The mode change recolors the whole UI, so the marquee control acknowledges it: the new glyph
       pops in on each cycle. Keyed on the theme so the swap re-mounts, gated on reduced motion. -->
  {#key controller.theme}
    <span class="glyph" in:scale={{ start: 0.5, duration: prefersReducedMotion() ? 0 : 200 }}>
      <Icon size={20} aria-hidden="true" />
    </span>
  {/key}
</button>

<style>
.glyph {
  display: inline-flex;
}
</style>
