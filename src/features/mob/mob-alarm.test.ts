import { describe, expect, it } from 'vitest';
import type { AlarmControl, AlarmTone } from '$shared/audio';
import { MOB_TONE, MobAlarm } from './mob-alarm';

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

describe('MobAlarm', () => {
  it('sounds the MOB tone while active and unacknowledged', () => {
    const { control, calls, tone } = fakeControl();
    const alarm = new MobAlarm(control);
    alarm.update(true, false);
    expect(calls).toEqual(['start']);
    expect(tone()).toBe(MOB_TONE);
  });

  it('stays silent when acknowledged or inactive', () => {
    const { control, calls } = fakeControl();
    const alarm = new MobAlarm(control);
    alarm.update(true, true);
    alarm.update(false, false);
    expect(calls).toEqual(['stop', 'stop']);
  });
});
