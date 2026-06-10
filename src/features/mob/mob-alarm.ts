import { Alarm, type AlarmControl, type AlarmTone } from '$shared/audio';

// The most urgent tone in the app: a fast four-beep burst pitched above the collision two-beep,
// repeating with almost no gap, so it reads as the emergency it is.
export const MOB_TONE: AlarmTone = {
  frequency: 950,
  beepMs: 120,
  gapMs: 80,
  beeps: 4,
  periodMs: 1100,
  volume: 0.2,
};

// Drives the audible man-overboard alarm: sounds while an MOB is active and not acknowledged.
export class MobAlarm {
  #alarm: AlarmControl;

  constructor(alarm: AlarmControl = new Alarm()) {
    this.#alarm = alarm;
  }

  // Resume the audio context from a user gesture (browser autoplay policy).
  prime(): void {
    this.#alarm.prime();
  }

  update(active: boolean, acknowledged: boolean): void {
    if (active && !acknowledged) this.#alarm.start(MOB_TONE);
    else this.#alarm.stop();
  }

  stop(): void {
    this.#alarm.stop();
  }
}
