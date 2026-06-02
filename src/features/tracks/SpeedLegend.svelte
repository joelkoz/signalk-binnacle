<script lang="ts">
// A small gradient key for the speed-colored track. The color stops mirror the overlay's SOG
// interpolation (0, about 5 kn, about 10 kn); the colors come from the active theme's track
// paint tokens so the legend matches the line in day, dusk, and night-red.
interface Props {
  slow: string;
  mid: string;
  fast: string;
}

const { slow, mid, fast }: Props = $props();

const gradient = $derived(`linear-gradient(to right, ${slow}, ${mid}, ${fast})`);
</script>

<div class="legend" aria-label="Track speed key">
  <span class="caption">Speed</span>
  <div class="bar" style:background={gradient}></div>
  <div class="ticks">
    <span>0</span>
    <span>5</span>
    <span>10 kn</span>
  </div>
</div>

<style>
.legend {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.4rem 0.55rem;
  border-radius: 0.4rem;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  font-size: 0.7rem;
  color: var(--text-muted);
}
.caption {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.bar {
  inline-size: 9rem;
  block-size: 0.5rem;
  border-radius: 0.25rem;
}
.ticks {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}
</style>
