<script lang="ts">
import { HostConnection, windowPort } from 'signalk-plotterext-bus/host';
import { onMount } from 'svelte';
import type { ContextKind, ExtContext, PlotterExtHost } from '$entities/plotter-ext';

// One sandboxed extension iframe wired to the host bus. It builds the per-context host API method
// set from the host store, opens a HostConnection over the iframe window, and registers the
// connection for event routing. The sandbox grants scripts and same-origin (so the extension can
// call the server with the user's session) plus forms, withholding top-navigation, popups, and
// modals. Note that allow-scripts with allow-same-origin is a soft boundary: a same-origin frame
// can script its parent, so this relies on the content being trusted server-served code. The actual
// control is that resolveExtUrl only ever loads a same-origin URL into this frame.

interface HostInfo {
  host: string;
  hostVersion: string;
  apiVersion: string;
  capabilities: string[];
}

interface Props {
  host: PlotterExtHost;
  hostInfo: HostInfo;
  kind: ContextKind;
  extensionId: string;
  id: string;
  instanceId?: string | null;
  targetInstance?: string | null;
  targetWidget?: string | null;
  src: string;
  title: string;
  frameClass?: string;
}

const {
  host,
  hostInfo,
  kind,
  extensionId,
  id,
  instanceId = null,
  targetInstance = null,
  targetWidget = null,
  src,
  title,
  frameClass = '',
}: Props = $props();

let frame = $state<HTMLIFrameElement>();

onMount(() => {
  const win = frame?.contentWindow;
  if (!win) return;
  const context: ExtContext = { kind, extensionId, id, instanceId, targetInstance, targetWidget };
  const conn = new HostConnection({
    port: windowPort(win),
    hostInfo,
    context: { kind, id, instanceId, targetInstance, targetWidget },
    methods: host.handlersFor(context),
    onError: (err) =>
      console.warn(`[plotterext] host method error (ext=${extensionId} ctx=${kind}/${id})`, err),
  });
  host.register(conn, context);
  return () => {
    host.unregister(conn);
    conn.close();
  };
});
</script>

<!-- biome-ignore lint/a11y/useIframeTitle: title is always supplied via the required {title} prop -->
<iframe
  bind:this={frame}
  {src}
  {title}
  class={frameClass}
  sandbox="allow-scripts allow-same-origin allow-forms"
  referrerpolicy="no-referrer"
  allow=""
></iframe>

<style>
iframe {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  border: 0;
  background: transparent;
}
</style>
