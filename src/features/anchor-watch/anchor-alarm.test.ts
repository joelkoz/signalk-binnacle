import { describe, expect, it } from 'vitest';
import type { AlarmControl, AlarmTone } from '$shared/audio';
import { ANCHOR_TONE, AnchorAlarm } from './anchor-alarm';

function fakeControl() {
  const calls: string[] = [];
  let tone: AlarmTone | undefined;
  const control: AlarmControl = {
    prime: () => calls.push('prime'),
    start: (next) => {
      calls.push('start');
      tone = next;
    },
    stop: () => calls.push('stop'),
  };
  return { control, calls, tone: () => tone };
}

describe('AnchorAlarm', () => {
  it('sounds the anchor tone while dragging unacknowledged', () => {
    const { control, calls, tone } = fakeControl();
    const alarm = new AnchorAlarm(control);
    alarm.update(true, false);
    expect(calls).toEqual(['start']);
    expect(tone()).toBe(ANCHOR_TONE);
  });

  it('stays silent when acknowledged and when not dragging', () => {
    const { control, calls } = fakeControl();
    const alarm = new AnchorAlarm(control);
    alarm.update(true, true);
    alarm.update(false, false);
    expect(calls).toEqual(['stop', 'stop']);
  });

  it('stop() silences outright', () => {
    const { control, calls } = fakeControl();
    const alarm = new AnchorAlarm(control);
    alarm.update(true, false);
    alarm.stop();
    expect(calls).toEqual(['start', 'stop']);
  });
});
