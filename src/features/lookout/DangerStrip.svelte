<script lang="ts">
import type { CollisionAssessment } from '$entities/collision';
import { formatCpaNm, formatTcpaMin } from '$shared/lib';

interface Props {
  collision: CollisionAssessment;
  // Whether the collision alarm sound is currently muted, and a handler to toggle it. Surfaced here
  // so silencing the alarm during a close-quarters situation is one tap, not a dive into the menu.
  muted: boolean;
  onToggleMute: () => void;
}

const { collision, muted, onToggleMute }: Props = $props();

const MAX_ROWS = 4;

const contacts = $derived(collision.assessment.contacts);
const top = $derived(contacts.slice(0, MAX_ROWS));
const overflow = $derived(Math.max(0, contacts.length - MAX_ROWS));
const computedFallback = $derived(contacts.some((c) => c.source === 'computed'));
// Grade the strip by the worst contact (contacts[0] is severity-then-time sorted): a warning-only
// situation reads as caution, not the full alarm, so the strongest red is reserved for real danger.
const worstIsDanger = $derived(contacts[0]?.severity !== 'warning');
// Acknowledged means the operator has seen it and silenced the sound, but the contact is still
// closing, so the strip stays on screen in a dimmed state with its CPA and TCPA visible rather than
// vanishing. An escalation past the inner ring un-dims it and restores the actions, since the alarm
// is sounding again regardless of the acknowledge.
const acknowledged = $derived(collision.suppressed && !collision.escalating);
</script>

{#if contacts.length > 0}
  <!-- No aria-live here: App owns the single assertive collision channel (a concise spoken summary in
       a persistent role=alert region), so announcing this whole contact list assertively too would
       double-speak the danger. This stays a labeled visual landmark. -->
  <aside
    class="bottom-strip {worstIsDanger ? 'bottom-strip--alarm' : 'bottom-strip--warning'}"
    class:is-ack={acknowledged}
    aria-label={worstIsDanger ? 'Collision danger' : 'Collision warning'}
  >
    <div class="head">
      <span class="title">{worstIsDanger ? 'Danger' : 'Caution'}</span>
      {#if acknowledged}
        <span class="note ack-tag">Acknowledged</span>
      {/if}
      {#if computedFallback}
        <span class="note">computing locally</span>
      {/if}
      {#if !acknowledged}
        <div class="actions">
          <button
            type="button"
            class="ack ack--warning"
            aria-pressed={muted}
            onclick={onToggleMute}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" class="ack" onclick={() => collision.acknowledge()}>
            Acknowledge
          </button>
        </div>
      {/if}
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
/* The two strip actions sit together at the trailing edge. The shared .ack carries its own auto
   margin, so it is neutralized here and the wrapper owns the push instead. A wide gutter and the
   warning-colored Mute keep the two safety buttons from reading as twins, so a wrong tap in a
   seaway is less likely. */
.actions {
  margin-inline-start: auto;
  display: flex;
  gap: var(--space-4);
}
.actions .ack {
  margin-inline-start: 0;
}
/* Acknowledged: the alarm is silenced and the operator has the contact in hand, so the strip dims
   but keeps its CPA and TCPA on screen while the target is still closing. */
.is-ack {
  opacity: 0.62;
}
.ack-tag {
  margin-inline-start: auto;
  font-weight: 600;
  white-space: nowrap;
}
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
  color: var(--text);
}
</style>
