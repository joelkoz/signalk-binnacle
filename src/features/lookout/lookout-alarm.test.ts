import { describe, expect, it } from 'vitest';
import type { Severity } from '$entities/collision';
import type { AlarmControl, AlarmTone } from '$shared/audio';
import { LookoutAlarm } from './lookout-alarm';

class FakeAlarm implements AlarmControl {
  events: string[] = [];
  prime(): void {
    this.events.push('prime');
  }
  start(_tone: AlarmTone): void {
    this.events.push('start');
  }
  stop(): void {
    this.events.push('stop');
  }
}

describe('LookoutAlarm', () => {
  it('sounds for an active, unacknowledged, unmuted danger', () => {
    const fake = new FakeAlarm();
    new LookoutAlarm(fake).update('danger', false, false);
    expect(fake.events).toEqual(['start']);
  });

  it('stays silent when acknowledged, muted, or not a danger', () => {
    const cases: Array<[Severity, boolean, boolean]> = [
      ['danger', true, false], // acknowledged
      ['danger', false, true], // muted
      ['warning', false, false], // warning is visual only
      ['clear', false, false],
    ];
    for (const [worst, suppressed, muted] of cases) {
      const fake = new FakeAlarm();
      new LookoutAlarm(fake).update(worst, suppressed, muted);
      expect(fake.events).toEqual(['stop']);
    }
  });

  it('forwards prime to the alarm', () => {
    const fake = new FakeAlarm();
    new LookoutAlarm(fake).prime();
    expect(fake.events).toEqual(['prime']);
  });
});
