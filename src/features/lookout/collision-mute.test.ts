import { describe, expect, it } from 'vitest';
import { CollisionMute } from './collision-mute.svelte';

// A plain mutable clock: CollisionMute.active is a plain getter, so it re-reads clock.now on every
// call and needs no reactivity here.
function clockAt(now: number): { now: number } {
  return { now };
}

describe('CollisionMute', () => {
  it('starts unmuted', () => {
    const mute = new CollisionMute(clockAt(0), 10_000);
    expect(mute.active).toBe(false);
    expect(mute.remainingMs).toBe(0);
  });

  it('mutes for the bounded window, then lifts on its own as the clock passes it', () => {
    const clock = clockAt(1000);
    const mute = new CollisionMute(clock, 10_000);
    mute.mute();
    expect(mute.active).toBe(true);
    expect(mute.remainingMs).toBe(10_000);
    clock.now = 1000 + 9_000;
    expect(mute.active).toBe(true);
    clock.now = 1000 + 10_001;
    expect(mute.active).toBe(false);
    expect(mute.remainingMs).toBe(0);
  });

  it('toggles mute on and off', () => {
    const mute = new CollisionMute(clockAt(0), 10_000);
    mute.toggle();
    expect(mute.active).toBe(true);
    mute.toggle();
    expect(mute.active).toBe(false);
  });

  it('unmute clears an active mute immediately', () => {
    const mute = new CollisionMute(clockAt(0), 10_000);
    mute.mute();
    mute.unmute();
    expect(mute.active).toBe(false);
  });
});
