import type { Severity } from '$entities/collision';
import { Alarm, type AlarmControl, DANGER_TONE } from '$shared/audio';

// Drives the audible alarm from the collision assessment. The alarm sounds only for an
// active danger that has not been acknowledged or muted; a warning is visual only.
export class LookoutAlarm {
  #alarm: AlarmControl;

  constructor(alarm: AlarmControl = new Alarm()) {
    this.#alarm = alarm;
  }

  // Resume the audio context from a user gesture (browser autoplay policy).
  prime(): void {
    this.#alarm.prime();
  }

  // Sound the alarm for an active danger that is neither acknowledged nor muted. `escalate` is the
  // hard-inner-ring override: a genuinely close, imminent contact sounds regardless of mute or
  // acknowledge, so a wide threshold setting or a stale mute can never silence a real emergency.
  update(worst: Severity, suppressed: boolean, muted: boolean, escalate = false): void {
    const sound = worst === 'danger' && (escalate || (!suppressed && !muted));
    if (sound) this.#alarm.start(DANGER_TONE);
    else this.#alarm.stop();
  }

  // Silence the alarm outright (e.g. on teardown).
  stop(): void {
    this.#alarm.stop();
  }
}
