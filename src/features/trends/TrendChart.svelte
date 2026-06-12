<script lang="ts">
import uPlot, { type AlignedData } from 'uplot';
import type { Theme } from '$shared/ui';
import 'uplot/dist/uPlot.min.css';

interface Props {
  times: readonly number[];
  values: ReadonlyArray<number | null>;
  // Re-resolves every color from the CSS variables, so night-red holds without a rebuild.
  theme: Theme;
}

const { times, values, theme }: Props = $props();

const CHART_HEIGHT = 120;

let host: HTMLDivElement | undefined = $state();
let chart: uPlot | undefined;

// Colors resolve from the live CSS variables at draw time, so one redraw re-themes the canvas.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function makeChart(el: HTMLDivElement, width: number): uPlot {
  const axis: uPlot.Axis = {
    stroke: () => cssVar('--text-muted'),
    grid: { stroke: () => cssVar('--border'), width: 1 },
    ticks: { stroke: () => cssVar('--border'), width: 1 },
  };
  return new uPlot(
    {
      width,
      height: CHART_HEIGHT,
      scales: { x: { time: true } },
      series: [
        {},
        {
          stroke: () => cssVar('--accent'),
          width: 2,
          spanGaps: false,
          points: { show: false },
        },
      ],
      axes: [axis, { ...axis, size: 52 }],
      legend: { show: false },
      cursor: { show: false },
    },
    [times as number[], values as (number | null)[]] as AlignedData,
    el,
  );
}

$effect(() => {
  const el = host;
  if (!el) return;
  const width = el.clientWidth || 280;
  chart = makeChart(el, width);
  const resize = new ResizeObserver(() => {
    if (chart && el.clientWidth > 0) chart.setSize({ width: el.clientWidth, height: CHART_HEIGHT });
  });
  resize.observe(el);
  return () => {
    resize.disconnect();
    chart?.destroy();
    chart = undefined;
  };
});

$effect(() => {
  chart?.setData([times as number[], values as (number | null)[]] as AlignedData);
});

$effect(() => {
  void theme;
  chart?.redraw(false, true);
});
</script>

<div class="trend-chart" bind:this={host}></div>

<style>
.trend-chart {
  inline-size: 100%;
  min-block-size: 120px;
}
/* The library positions its own DOM; only the text color rides the theme tokens. */
.trend-chart :global(.u-wrap) {
  color: var(--text-muted);
}
</style>
