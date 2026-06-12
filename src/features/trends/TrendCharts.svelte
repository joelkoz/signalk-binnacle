<script lang="ts">
import {
  formatFixed,
  lengthUnit,
  metersPerSecondToKnots,
  metersToFeet,
  pressureUnit,
  pressureValue,
  type UnitsMode,
} from '$shared/lib';
import type { Theme } from '$shared/ui';
import TrendChart from './TrendChart.svelte';
import { TREND_METRICS, type TrendKey, type TrendSeries } from './trend-metrics';

interface Props {
  // The 24 h history series when a provider answered, otherwise undefined per the panel's note.
  history: ReadonlyMap<TrendKey, TrendSeries> | undefined;
  sessionSeries: (key: TrendKey) => TrendSeries;
  mode: UnitsMode;
  theme: Theme;
}

const { history, sessionSeries, mode, theme }: Props = $props();

interface Display {
  convert: (si: number) => number | undefined;
  unit: string;
  digits: number;
}

const displays = $derived<Record<TrendKey, Display>>({
  depth: {
    convert: (si) => (mode === 'imperial' ? metersToFeet(si) : si),
    unit: lengthUnit(mode),
    digits: 1,
  },
  wind: { convert: (si) => metersPerSecondToKnots(si), unit: 'kn', digits: 1 },
  pressure: {
    convert: (si) => pressureValue(si, mode),
    unit: pressureUnit(mode),
    digits: mode === 'imperial' ? 2 : 0,
  },
  sog: { convert: (si) => metersPerSecondToKnots(si), unit: 'kn', digits: 1 },
});

interface Section {
  key: TrendKey;
  label: string;
  unit: string;
  times: readonly number[];
  values: ReadonlyArray<number | null>;
  latest: string;
}

function converted(series: TrendSeries, display: Display): ReadonlyArray<number | null> {
  return series.values.map((value) => (value == null ? null : (display.convert(value) ?? null)));
}

const sections = $derived(
  TREND_METRICS.map((metric): Section => {
    const display = displays[metric.key];
    const series = history?.get(metric.key) ?? sessionSeries(metric.key);
    const values = converted(series, display);
    let latest: number | null = null;
    for (let at = values.length - 1; at >= 0; at--) {
      const value = values[at];
      if (value != null) {
        latest = value;
        break;
      }
    }
    return {
      key: metric.key,
      label: metric.label,
      unit: display.unit,
      times: series.times,
      values,
      latest: latest == null ? '--' : formatFixed(latest, display.digits),
    };
  }),
);

const hasData = (section: Section): boolean => section.values.some((value) => value != null);
</script>

<div class="trend-charts">
  {#each sections as section (section.key)}
    <section aria-label="{section.label} trend">
      <div class="head">
        <span class="caps-label">{section.label}</span>
        <span class="latest"><b>{section.latest}</b> {section.unit}</span>
      </div>
      {#if hasData(section)}
        <TrendChart times={section.times} values={section.values} {theme} />
      {:else}
        <p class="muted-note">No samples for this instrument yet.</p>
      {/if}
    </section>
  {/each}
</div>

<style>
.trend-charts {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.latest {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.latest b {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--text-base);
}
</style>
