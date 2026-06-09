<script lang="ts">
import { Eye, EyeOff } from '@lucide/svelte';

interface Props {
  // Whether the item is currently shown on the chart.
  shown: boolean;
  onToggle: () => void;
}

const { shown, onToggle }: Props = $props();
</script>

<button
  type="button"
  class="icon-btn"
  aria-pressed={shown}
  aria-label={shown ? 'Hide on chart' : 'Show on chart'}
  title={shown ? 'Hide on chart' : 'Show on chart'}
  onclick={onToggle}
>
  {#if shown}
    <Eye size={18} aria-hidden="true" />
  {:else}
    <EyeOff size={18} aria-hidden="true" />
  {/if}
</button>
