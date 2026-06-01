<script lang="ts">
import type { CollisionAssessment } from '$entities/collision';
import { metersToNauticalMiles } from '$shared/lib';

interface Props {
  collision: CollisionAssessment;
}

const { collision }: Props = $props();

const MAX_ROWS = 4;

const contacts = $derived(collision.assessment.contacts);
const top = $derived(contacts.slice(0, MAX_ROWS));
const overflow = $derived(Math.max(0, contacts.length - MAX_ROWS));
const computedFallback = $derived(contacts.some((c) => c.source === 'computed'));

function nm(meters: number): string {
  return (metersToNauticalMiles(meters) ?? 0).toFixed(2);
}

function minutes(seconds: number): string {
  return (seconds / 60).toFixed(1);
}
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
          <span class="metric">CPA <b>{nm(contact.cpaMeters)}</b> nm</span>
          <span class="metric">TCPA <b>{minutes(contact.tcpaSeconds)}</b> min</span>
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
  border-radius: 0.5rem;
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
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--alarm);
}
.note {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.ack {
  margin-inline-start: auto;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
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
  font-size: 0.85rem;
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
  color: var(--text);
}
.more {
  margin: 0.3rem 0 0;
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
