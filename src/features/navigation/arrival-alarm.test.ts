import { describe, expect, it } from 'vitest';
import type { AlarmControl, AlarmTone } from '$shared/audio';
import { ArrivalAlarm } from './arrival-alarm';

class FakeAlarm implements AlarmControl {
  events: string[] = [];
  prime() {
    this.events.push('prime');
  }
  start(_t: AlarmTone) {
    this.events.push('start');
  }
  stop() {
    this.events.push('stop');
  }
}

describe('ArrivalAlarm', () => {
  it('sounds once on arrival, not again until reset, and is silent when not arrived or muted', () => {
    const fake = new FakeAlarm();
    const alarm = new ArrivalAlarm(fake);
    alarm.update(true, false);
    expect(fake.events).toEqual(['start']);
    alarm.update(true, false); // still arrived: do not restart
    expect(fake.events).toEqual(['start']);
    alarm.update(false, false); // left the circle: reset and stop
    expect(fake.events.at(-1)).toBe('stop');
    alarm.update(true, true); // arrived but muted
    expect(fake.events.filter((e) => e === 'start')).toHaveLength(1);
  });
});
