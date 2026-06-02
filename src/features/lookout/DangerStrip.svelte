<script lang="ts">
import type { CollisionAssessment } from '$entities/collision';
import { formatCpaNm, formatTcpaMin } from '$shared/lib';

interface Props {
  collision: CollisionAssessment;
}

const { collision }: Props = $props();

const MAX_ROWS = 4;

const contacts = $derived(collision.assessment.contacts);
const top = $derived(contacts.slice(0, MAX_ROWS));
const overflow = $derived(Math.max(0, contacts.length - MAX_ROWS));
const computedFallback = $derived(contacts.some((c) => c.source === 'computed'));
</script>

{#if contacts.length > 0 && !collision.suppressed}
  <aside class="danger-strip" aria-label="Collision danger" aria-live="assertive">
    <div class="head">
      <span class="title">Danger</span>
      {#if computedFallback}
        <span class="note">computing locally</span>
      {/if}
      <button type="button" class="ack" onclick={() => collision.acknowledge()}>Acknowledge</button>
    </div>
    <ul class="list">
      {#each top as contact (contact.id)}
        <li class="row {contact.severity}">
          <span class="name">{contact.name || contact.id}</span>
          <span class="metric">CPA <b>{formatCpaNm(contact.cpaMeters)}</b> nm</span>
          <span class="metric">TCPA <b>{formatTcpaMin(contact.tcpaSeconds, 1)}</b> min</span>
        </li>
      {/each}
    </ul>
    {#if overflow > 0}
      <p class="more">+{overflow} more</p>
    {/if}
  </aside>
{/if}

<style>
.danger-strip {
  inline-size: min(28rem, calc(100% - 1.5rem));
  padding: 0.5rem 0.75rem;
  background: var(--surface-overlay);
  border: 1px solid var(--alarm);
  border-radius: var(--radius-md);
  color: var(--text);
  font-family: var(--font-ui);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-block-end: 0.4rem;
}
.title {
  font-size: var(--text-md);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--alarm);
}
.note {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.ack {
  margin-inline-start: auto;
  font: inherit;
  font-size: var(--text-base);
  padding: 0.5rem 0.9rem;
  min-block-size: var(--control-size);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  font-size: var(--text-base);
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row.danger .name {
  color: var(--alarm);
  font-weight: 600;
}
.metric b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
}
.more {
  margin: 0;
  margin-block-start: 0.3rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
