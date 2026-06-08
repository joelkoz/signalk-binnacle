<script lang="ts">
// A label, value spec list shared by the chart detail panel and the import review step, so the two
// chart readouts share one definition and cannot drift. Each caller supplies its own rows and order.
interface SpecRow {
  label: string;
  value: string;
}

const { rows }: { rows: SpecRow[] } = $props();
</script>

<dl class="spec-list">
  {#each rows as row (row.label)}
    <div>
      <dt>{row.label}</dt>
      <dd>{row.value}</dd>
    </div>
  {/each}
</dl>

<style>
.spec-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  font-size: var(--text-sm);
}
.spec-list div {
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: var(--space-2);
  padding-block: 0.3rem;
}
/* A hairline between rows so a dense spec sheet scans as a table, not a gray block. */
.spec-list div + div {
  border-block-start: 1px solid var(--border);
}
.spec-list dt {
  color: var(--text-muted);
}
.spec-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
