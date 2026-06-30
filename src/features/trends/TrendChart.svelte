<script lang="ts">
import uPlot, { type AlignedData } from 'uplot';
import type { Theme } from '$shared/ui';
import 'uplot/dist/uPlot.min.css';

interface Props {
  times: readonly number[];
  values: ReadonlyArray<number | null>;
  // Re-resolves every color from the CSS variables, so night-red holds without a rebuild.
  theme: Theme;
  // Fires as the cursor moves over the plot so the section header can read the value (already in
  // display units) and time under the cursor, and undefined when the cursor leaves the plot.
  onHover?: (point: { timeSec: number; value: number | null } | undefined) => void;
}

const { times, values, theme, onHover }: Props = $props();

const CHART_HEIGHT = 120;
// The left value-axis gutter; wide enough for a four-digit pressure label without clipping.
const YAXIS_SIZE = 52;
// Width used for the first chart build before the host has laid out and reported a clientWidth.
const FALLBACK_WIDTH = 280;

let host: HTMLDivElement | undefined = $state();
// $state.raw, not a plain let: the data and theme effects below must re-run when the mount
// effect replaces the instance, and raw skips proxying the uPlot internals.
let chart = $state.raw<uPlot | undefined>(undefined);

// Colors resolve from the live CSS variables at draw time, so one redraw re-themes the canvas.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor';
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
      axes: [axis, { ...axis, size: YAXIS_SIZE }],
      legend: { show: false },
      // A hairline cursor lets a navigator read any past point, not just the latest. The readout is
      // pushed up to the section header through onHover rather than drawn as a uPlot legend, so the
      // value sits with its label and unit. Reading u.data inside the hook keeps it current after a
      // setData refresh, where a closure over the props would go stale.
      cursor: { show: true, points: { show: true } },
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx == null) {
              onHover?.(undefined);
              return;
            }
            onHover?.({ timeSec: u.data[0][idx], value: u.data[1][idx] ?? null });
          },
        ],
      },
    },
    // uPlot reads but never writes these arrays, so stripping readonly via the casts is safe.
    [times as number[], values as (number | null)[]] as AlignedData,
    el,
  );
}

$effect(() => {
  const el = host;
  if (!el) return;
  const width = el.clientWidth || FALLBACK_WIDTH;
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
  // uPlot reads but never writes these arrays, so stripping readonly via the casts is safe.
  chart?.setData([times as number[], values as (number | null)[]] as AlignedData);
});

$effect(() => {
  void theme;
  chart?.redraw(false, true);
});
</script>

<div class="trend-chart" bind:this={host} style:min-block-size="{CHART_HEIGHT}px"></div>

<style>
.trend-chart {
  inline-size: 100%;
}
/* The library positions its own DOM; only the text color rides the theme tokens. */
.trend-chart :global(.u-wrap) {
  color: var(--text-muted);
}
</style>
