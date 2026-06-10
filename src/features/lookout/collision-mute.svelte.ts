import type { ReactiveClock } from '$shared/lib';

// The default mute window. Long enough to clear a busy harbor entrance, short enough that a forgotten
// mute re-arms itself well before the next leg.
const DEFAULT_MUTE_MS = 10 * 60_000;

// A session-only mute for the collision alarm. Muting silences the alarm for a bounded window, then
// the mute lifts on its own and the alarm re-arms. It is deliberately NOT persisted: a mute set in a
// crowded anchorage must never carry silently into the next passage or across a reload. A genuinely
// close, imminent contact overrides the mute regardless, which is enforced in LookoutAlarm via the
// escalation flag, not here.
export class CollisionMute {
  #clock: ReactiveClock;
  #durationMs: number;
  // The epoch at which the mute expires; zero means not muted. Reactive so `active` re-evaluates as
  // the clock ticks past it, lifting the mute without any further input.
  #until = $state(0);

  constructor(clock: ReactiveClock, durationMs: number = DEFAULT_MUTE_MS) {
    this.#clock = clock;
    this.#durationMs = durationMs;
  }

  get active(): boolean {
    return this.#clock.now < this.#until;
  }

  get remainingMs(): number {
    return Math.max(0, this.#until - this.#clock.now);
  }

  mute(): void {
    this.#until = this.#clock.now + this.#durationMs;
  }

  unmute(): void {
    this.#until = 0;
  }

  toggle(): void {
    if (this.active) this.unmute();
    else this.mute();
  }
}
