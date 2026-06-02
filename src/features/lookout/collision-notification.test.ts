import { describe, expect, it } from 'vitest';
import type { Assessment, DangerContact } from '$entities/collision';
import { buildNotification, CollisionNotifier, NOTIFICATION_PATH } from './collision-notification';

function contact(over: Partial<DangerContact> = {}): DangerContact {
  return {
    id: 'urn:mrn:imo:mmsi:123',
    name: 'Tug',
    position: { latitude: 36.8, longitude: -121.7 },
    cpaMeters: 463, // 0.25 nm
    tcpaSeconds: 300, // 5 min
    severity: 'danger',
    source: 'computed',
    ...over,
  };
}

describe('buildNotification', () => {
  it('raises an alarm with sound for a danger', () => {
    const a: Assessment = { contacts: [contact()], worst: 'danger' };
    const n = buildNotification(a);
    expect(n.state).toBe('alarm');
    expect(n.method).toEqual(['visual', 'sound']);
    expect(n.message).toContain('CPA 0.25 nm');
    expect(n.message).toContain('TCPA 5 min');
  });

  it('warns visually for a warning', () => {
    const a: Assessment = { contacts: [contact({ severity: 'warning' })], worst: 'warning' };
    const n = buildNotification(a);
    expect(n.state).toBe('warn');
    expect(n.method).toEqual(['visual']);
  });

  it('returns normal when clear', () => {
    expect(buildNotification({ contacts: [], worst: 'clear' }).state).toBe('normal');
  });
});

describe('CollisionNotifier', () => {
  it('publishes on state change but not on every tick', () => {
    const sent: Array<{ path: string; value: unknown }> = [];
    const notifier = new CollisionNotifier((path, value) => sent.push({ path, value }));
    const danger: Assessment = { contacts: [contact()], worst: 'danger' };

    notifier.update(danger);
    notifier.update({ contacts: [contact({ cpaMeters: 400 })], worst: 'danger' }); // same state+id
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      path: NOTIFICATION_PATH,
      value: expect.objectContaining({ state: 'alarm' }),
    });
  });

  it('does not publish a clear before any active alert, but does after one', () => {
    const sent: Array<{ value: unknown }> = [];
    const notifier = new CollisionNotifier((_path, value) => sent.push({ value }));
    const clear: Assessment = { contacts: [], worst: 'clear' };

    notifier.update(clear); // initial clear: nothing to clear, no publish
    expect(sent).toHaveLength(0);

    notifier.update({ contacts: [contact()], worst: 'danger' }); // alarm
    notifier.update(clear); // now a real clear
    expect(sent).toHaveLength(2);
    expect(sent[1].value).toMatchObject({ state: 'normal' });
  });
});
