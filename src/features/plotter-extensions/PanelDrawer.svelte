<script lang="ts">
import type { PlotterExtHost } from '$entities/plotter-ext';
import { SlideOver } from '$shared/ui';
import ExtIframe from './ExtIframe.svelte';
import { HOST_INFO, resolveExtUrl } from './util';

interface Props {
  host: PlotterExtHost;
  origin: string;
}

const { host, origin }: Props = $props();

const open = $derived(host.openPanel);
const def = $derived(
  open
    ? host.extensions
        .find((e) => e.id === open.extensionId)
        ?.panels.find((p) => p.id === open.panelId)
    : undefined,
);
</script>

{#if open && def}
  {#key `${open.extensionId}/${open.panelId}`}
    <!-- The slide-over shell carries no positioning of its own; an absolutely positioned slot pins
         it full-height to the trailing edge, mirroring the note detail. Without it the panel falls
         into normal flow and collapses into the footer. -->
    <div class="pe-panel-slot">
      <SlideOver title={def.title} dock="right" onClose={() => host.closePanel()}>
        <div class="pe-panel-body">
          <ExtIframe
            {host}
            hostInfo={HOST_INFO}
            kind="panel"
            extensionId={open.extensionId}
            id={open.panelId}
            src={resolveExtUrl(origin, def.url)}
            title={def.title}
          />
        </div>
      </SlideOver>
    </div>
  {/key}
{/if}

<style>
.pe-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: var(--z-panel);
}
@media (max-width: 600px) {
  .pe-panel-slot {
    inset-block-start: auto;
    inset-inline: 0;
    inline-size: auto;
  }
}
.pe-panel-body {
  min-block-size: 60dvh;
  block-size: 100%;
}
</style>
