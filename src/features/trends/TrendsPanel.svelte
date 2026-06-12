<script lang="ts">
import type { UnitsMode } from '$shared/lib';
import type { HistoryProviders } from '$shared/signalk';
import type { Theme } from '$shared/ui';
import { SlideOver } from '$shared/ui';
import type { TrendSessionRecorder } from './session-recorder.svelte';
import type { TrendKey, TrendSeries } from './trend-metrics';
import { loadTrendHistory, type TrendHistory } from './trends-history';

interface Props {
  origin: string;
  token: string | undefined;
  // undefined while unknown or unavailable; empty ids means the API exists with no provider.
  providers: HistoryProviders | undefined;
  recorder: TrendSessionRecorder;
  mode: UnitsMode;
  theme: Theme;
  onClose: () => void;
  onBack?: () => void;
}

const { origin, token, providers, recorder, mode, theme, onClose, onBack }: Props = $props();

const hasProvider = $derived((providers?.ids.length ?? 0) > 0);

let history = $state<TrendHistory | undefined>(undefined);
let loading = $state(false);
let loadFailed = $state(false);

$effect(() => {
  if (!hasProvider || !providers) return;
  loading = true;
  loadFailed = false;
  loadTrendHistory(origin, token, providers).then((got) => {
    history = got;
    loading = false;
    loadFailed = got === undefined;
  });
});

// The session recorder's version is the reactive pulse for the fallback series; reading it here
// makes the charts re-derive on each new sample without polling.
const sessionSeries = $derived.by(() => {
  void recorder.version;
  return (key: TrendKey): TrendSeries => recorder.series(key);
});

const sourceNote = $derived.by(() => {
  if (history?.series) {
    return history.provider ? `Last 24 hours, from ${history.provider}` : 'Last 24 hours';
  }
  if (loading) return 'Loading the last 24 hours...';
  if (hasProvider && loadFailed) return 'History query failed; showing this session only.';
  return 'This session only. A history provider on the server (for example signalk-questdb or signalk-to-influxdb2) unlocks the full 24 hour view.';
});
</script>

<SlideOver title="Trends" closeLabel="Close trends panel" {onClose} {onBack}>
  <div class="trends">
    <p class="muted-note" role="status">{sourceNote}</p>
    {#await import('./TrendCharts.svelte') then charts}
      <charts.default history={history?.series} {sessionSeries} {mode} {theme} />
    {/await}
  </div>
</SlideOver>

<style>
.trends {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--text-base);
}
</style>
