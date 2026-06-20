<script lang="ts">
import type { PlotterExtHost } from '$entities/plotter-ext';
import ExtIframe from './ExtIframe.svelte';
import { HOST_INFO, resolveExtUrl } from './util';

interface Props {
  host: PlotterExtHost;
  origin: string;
}

const { host, origin }: Props = $props();

// One hidden, headless iframe per declared background runtime, loaded while its extension is
// present and torn down when it leaves. The {#each} keying on extension and runtime id gives that
// lifecycle for free.
const runtimes = $derived(
  host.extensions.flatMap((ext) => ext.background.map((bg) => ({ extensionId: ext.id, bg }))),
);
</script>

<div class="pe-background" aria-hidden="true">
  {#each runtimes as entry (`${entry.extensionId}/${entry.bg.id}`)}
    {@const src = resolveExtUrl(origin, entry.bg.url)}
    {#if src}
      <ExtIframe
        {host}
        hostInfo={HOST_INFO}
        kind="background"
        extensionId={entry.extensionId}
        id={entry.bg.id}
        {src}
        title={entry.bg.title ?? entry.bg.id}
      />
    {/if}
  {/each}
</div>

<style>
.pe-background {
  position: absolute;
  inline-size: 0;
  block-size: 0;
  overflow: hidden;
  visibility: hidden;
}
</style>
