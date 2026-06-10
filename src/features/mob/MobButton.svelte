<script lang="ts">
import { LifeBuoy } from '@lucide/svelte';
import { onDestroy } from 'svelte';
import type { MobStore } from '$entities/mob';
import type { LatLon } from '$shared/geo';

interface Props {
  mob: MobStore;
  // Whether a GPS fix exists to mark at; without one (and without a mark) the button disables.
  hasFix: boolean;
  // The confirmed trigger: the app marks, publishes the boat-wide alarm, and flies to the mark.
  onTrigger: () => void;
  // Fly the chart to the existing mark.
  onLocate: (position: LatLon) => void;
}

const { mob, hasFix, onTrigger, onLocate }: Props = $props();

// The MOB button must never trigger on a stray tap, so marking takes two: the button pops out a
// confirm, and only the confirm marks. The window self-dismisses so a half-press cannot leave a
// live trigger armed on screen.
let confirming = $state(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
const CONFIRM_MS = 6000;

function dismiss(): void {
  clearTimeout(confirmTimer);
  confirmTimer = undefined;
  confirming = false;
}

// While a mark exists the button flies to it instead of re-marking, so a press cannot move the
// spot away from the person in the water; with no mark yet (including a remote alarm that carried
// none), it opens the confirm pop-out, and a second press dismisses it.
function onButton(): void {
  const mark = mob.position;
  if (mark) {
    dismiss();
    onLocate(mark);
    return;
  }
  if (confirming) {
    dismiss();
    return;
  }
  confirming = true;
  confirmTimer = setTimeout(dismiss, CONFIRM_MS);
}

function onConfirm(): void {
  dismiss();
  onTrigger();
}

onDestroy(dismiss);
</script>

<span class="mob-slot">
  <button
    type="button"
    class="btn btn-pill mob-btn"
    class:is-on={mob.active}
    aria-pressed={mob.active}
    aria-expanded={mob.active ? undefined : confirming}
    aria-label={mob.active ? 'Fly to the man overboard mark' : 'Mark man overboard here'}
    title={mob.active
      ? 'Fly to the MOB mark'
      : 'Mark man overboard at the boat position (asks to confirm)'}
    disabled={!mob.active && !hasFix}
    onclick={onButton}
  >
    <LifeBuoy size={16} aria-hidden="true" />
    MOB
  </button>
  {#if confirming}
    <button type="button" class="btn mob-confirm" onclick={onConfirm}>
      <LifeBuoy size={18} aria-hidden="true" />
      Confirm man overboard
    </button>
  {/if}
</span>

<style>
.mob-slot {
  position: relative;
  display: inline-flex;
}
/* The button reads as the emergency control it is: alarm-colored at rest, alarm-tinted while a
   mark is active (when it becomes fly-to-mark instead of re-marking). */
.mob-btn {
  color: var(--alarm);
  border-color: var(--alarm);
  font-weight: 600;
}
.mob-btn.is-on {
  background: var(--alarm-tint);
}
/* The confirm is deliberately big (a panicked, gloved tap must land) and unmistakably the alarm
   surface, dropped below the top-bar button so it cannot be hit by the tap that opened it. */
.mob-confirm {
  position: absolute;
  inset-block-start: calc(100% + var(--space-2));
  inset-inline-start: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: var(--space-3) var(--space-4);
  font-weight: 700;
  color: var(--alarm);
  border-color: var(--alarm);
  background: var(--alarm-tint);
  box-shadow: var(--shadow-overlay);
  z-index: var(--z-overlay);
}
.mob-confirm:hover:not(:disabled) {
  border-color: var(--alarm);
  background: var(--alarm-tint);
}
</style>
