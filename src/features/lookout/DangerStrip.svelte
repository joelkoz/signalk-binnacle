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
  <aside
    class="bottom-strip bottom-strip--alarm"
    aria-label="Collision danger"
    aria-live="assertive"
  >
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
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.name {
  flex: 1;
}
.row.danger .name {
  color: var(--alarm);
  font-weight: 600;
}
.row.warning .name {
  color: var(--warning);
  font-weight: 600;
}
.more {
  margin: 0;
  margin-block-start: 0.3rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
