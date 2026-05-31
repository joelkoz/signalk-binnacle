<script lang="ts">
import type { ThemeController } from '$shared/ui';

interface Props {
  controller: ThemeController;
}

const { controller }: Props = $props();

const LABELS: Record<string, string> = {
  day: 'Day',
  dusk: 'Dusk',
  'night-red': 'Night',
};
</script>

<button type="button" class="theme-toggle" onclick={() => controller.cycle()}>
  {LABELS[controller.theme] ?? controller.theme}
</button>

<style>
.theme-toggle {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.7rem;
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
