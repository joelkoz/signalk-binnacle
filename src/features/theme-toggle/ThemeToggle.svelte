<script lang="ts">
import { Moon, Sun, Sunset } from '@lucide/svelte';
import type { Component } from 'svelte';
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
  <Icon size={20} aria-hidden="true" />
</button>
