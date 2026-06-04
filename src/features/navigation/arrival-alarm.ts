import { Alarm, type AlarmControl, type AlarmTone } from '$shared/audio';

// A single short rising couplet, distinct from the urgent collision two-beep, so arrival is not
// confused with danger. Lower, sparser, and quieter.
export const ARRIVAL_TONE: AlarmTone = {
  frequency: 520,
  beepMs: 180,
  gapMs: 120,
  beeps: 2,
  periodMs: 2500,
  volume: 0.14,
};

export class ArrivalAlarm {
  #alarm: AlarmControl;
  #sounding = false;

  constructor(alarm: AlarmControl = new Alarm()) {
    this.#alarm = alarm;
  }

  prime(): void {
    this.#alarm.prime();
  }

  // arrived: inside the active waypoint's arrival circle. muted: the user silenced arrival.
  update(arrived: boolean, muted: boolean): void {
    if (arrived && !muted && !this.#sounding) {
      this.#sounding = true;
      this.#alarm.start(ARRIVAL_TONE);
      return;
    }
    if (!arrived || muted) {
      if (this.#sounding) this.#alarm.stop();
      this.#sounding = false;
    }
  }

  stop(): void {
    this.#alarm.stop();
    this.#sounding = false;
  }
}
