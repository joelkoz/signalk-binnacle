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

  update(worst: Severity, suppressed: boolean, muted: boolean): void {
    if (worst === 'danger' && !suppressed && !muted) this.#alarm.start(DANGER_TONE);
    else this.#alarm.stop();
  }
}
