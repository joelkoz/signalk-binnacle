<script lang="ts">
import { Trash2 } from '@lucide/svelte';
import type { PlotterExtHost } from '$entities/plotter-ext';
import { dialog } from '$shared/ui';
import ExtIframe from './ExtIframe.svelte';
import { HOST_INFO, resolveExtUrl } from './util';

interface Props {
  host: PlotterExtHost;
  origin: string;
}

const { host, origin }: Props = $props();

const cfg = $derived(host.configDialog);
const def = $derived(
  cfg?.panelId
    ? host.extensions
        .find((e) => e.id === cfg.extensionId)
        ?.panels.find((p) => p.id === cfg.panelId)
    : undefined,
);

function remove(): void {
  if (cfg) host.removePlacement(cfg.targetInstance);
}
</script>

{#if cfg}
  <div class="pe-scrim">
    {#key cfg.targetInstance}
      <div
        class="pe-config"
        role="dialog"
        aria-modal="true"
        aria-label={def?.title ?? 'Configure widget'}
        tabindex="-1"
        use:dialog={() => host.closeConfig()}
      >
        <header>
          <h2>{def?.title ?? 'Widget'}</h2>
        </header>
        {#if cfg.panelId && def}
          <div class="pe-config-body">
            <ExtIframe
              {host}
              hostInfo={HOST_INFO}
              kind="panel"
              extensionId={cfg.extensionId}
              id={cfg.panelId}
              targetInstance={cfg.targetInstance}
              targetWidget={cfg.targetWidget}
              src={resolveExtUrl(origin, def.url)}
              title={def.title}
            />
          </div>
        {:else}
          <p class="pe-config-note">No configuration available.</p>
        {/if}
        <footer>
          <button type="button" class="btn icon-btn--danger" onclick={remove}>
            <Trash2 size={16} aria-hidden="true" />
            Remove widget
          </button>
          <button type="button" class="btn" onclick={() => host.closeConfig()}>Close</button>
        </footer>
      </div>
    {/key}
  </div>
{/if}

<style>
.pe-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  background: var(--scrim);
}
.pe-config {
  display: flex;
  flex-direction: column;
  inline-size: min(26rem, calc(100dvw - 2 * var(--space-4)));
  max-block-size: 85dvh;
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.pe-config header {
  padding: var(--space-3) var(--space-4);
  border-block-end: 1px solid var(--border);
}
.pe-config h2 {
  margin: 0;
  font-size: var(--text-lg);
}
.pe-config-body {
  block-size: 50dvh;
}
.pe-config-note {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-muted);
}
.pe-config footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-block-start: 1px solid var(--border);
}
</style>
