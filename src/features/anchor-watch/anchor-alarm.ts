import { Alarm, type AlarmControl, type AlarmTone } from '$shared/audio';

// A three-beep burst, pitched between the urgent collision two-beep (880 Hz) and the calm arrival
// couplet (520 Hz), so a half-asleep navigator can tell which alarm woke them before reading a screen.
export const ANCHOR_TONE: AlarmTone = {
  frequency: 660,
  beepMs: 150,
  gapMs: 100,
  beeps: 3,
  periodMs: 1600,
  volume: 0.18,
};

// Drives the audible anchor-drag alarm. Sounds while a drag is active and not acknowledged; the
// latch semantics (what clears dragging, what acknowledged means per mode) live in the AnchorWatch.
export class AnchorAlarm {
  #alarm: AlarmControl;

  constructor(alarm: AlarmControl = new Alarm()) {
    this.#alarm = alarm;
  }

  // Resume the audio context from a user gesture (browser autoplay policy).
  prime(): void {
    this.#alarm.prime();
  }

  update(dragging: boolean, acknowledged: boolean): void {
    if (dragging && !acknowledged) this.#alarm.start(ANCHOR_TONE);
    else this.#alarm.stop();
  }

  stop(): void {
    this.#alarm.stop();
  }
}
