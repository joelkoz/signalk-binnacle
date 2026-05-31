<script lang="ts">
import { Moon, Sun, Sunset } from '@lucide/svelte';
import type { Component } from 'svelte';
import type { ThemeController } from '$shared/ui';

interface Props {
  controller: ThemeController;
}

const { controller }: Props = $props();

const ICONS: Record<string, Component> = {
  day: Sun,
  dusk: Sunset,
  'night-red': Moon,
};

const LABELS: Record<string, string> = {
  day: 'Day theme',
  dusk: 'Dusk theme',
  'night-red': 'Night theme',
};

const Icon = $derived(ICONS[controller.theme] ?? Sun);
const label = $derived(LABELS[controller.theme] ?? controller.theme);
</script>

<button
  type="button"
  class="theme-toggle"
  aria-label={`Switch theme (currently ${label})`}
  title={label}
  onclick={() => controller.cycle()}
>
  <Icon size={18} aria-hidden="true" />
</button>

<style>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
}
.theme-toggle:hover {
  border-color: var(--accent);
}
</style>
