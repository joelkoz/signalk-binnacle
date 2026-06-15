<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import type { PlotterExtHost } from '$entities/plotter-ext';
import BackgroundRuntimes from './BackgroundRuntimes.svelte';
import ConfigDialog from './ConfigDialog.svelte';
import FilterChips from './FilterChips.svelte';
import PanelDrawer from './PanelDrawer.svelte';
import WidgetOverlay from './WidgetOverlay.svelte';

// The single mount point for the plotter-extension host UI. App.svelte places this inside the chart
// host and feeds it the constructed host store and the server origin. With no extensions present
// every child renders nothing, so the chart is untouched.

interface Props {
  host: PlotterExtHost;
  origin: string;
}

const { host, origin }: Props = $props();

onMount(() => host.startRelay());
onDestroy(() => host.stopRelay());
</script>

<BackgroundRuntimes {host} {origin} />
<WidgetOverlay {host} {origin} />
<FilterChips {host} />
<PanelDrawer {host} {origin} />
<ConfigDialog {host} {origin} />
