import { describe, expect, it } from 'vitest';
import type { SKFrame } from '$shared/signalk';
import { SignalKStore } from '$shared/signalk';
import { NotificationsStore } from './notifications.svelte';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: new Map(Object.entries(self)) as SKFrame['self'],
    connection: { phase: 'open', attempt: 0 },
    epoch: 1000,
  };
}

function setup(self: Record<string, unknown>) {
  const store = new SignalKStore();
  store.applyFrame(frame(self));
  return { store, notifications: new NotificationsStore(store) };
}

describe('NotificationsStore', () => {
  it('lists only raised notifications, sorted by severity then path', () => {
    const { notifications } = setup({
      'notifications.b.warned': { state: 'warn', method: [], message: 'Warned' },
      'notifications.quiet': { state: 'normal', method: [], message: 'All clear' },
      'notifications.a.alarmed': { state: 'alarm', method: ['sound'], message: 'Alarmed' },
      'notifications.mob': { state: 'emergency', method: ['visual', 'sound'], message: 'MOB' },
      'notifications.advisory': { state: 'alert', method: ['visual'], message: 'Heads up' },
    });
    expect(notifications.list().map((n) => n.path)).toEqual([
      'notifications.mob',
      'notifications.a.alarmed',
      'notifications.b.warned',
      'notifications.advisory',
    ]);
  });

  it('carries the v2 id, status flags, and createdAt timestamp when present', () => {
    const { notifications } = setup({
      'notifications.navigation.anchor': {
        state: 'alarm',
        method: ['visual', 'sound'],
        message: 'Anchor drag',
        id: 'abc-123',
        createdAt: '2026-06-12T08:00:00Z',
        status: { silenced: true, acknowledged: false, canSilence: true, canAcknowledge: true },
      },
    });
    const [n] = notifications.list();
    expect(n).toMatchObject({
      id: 'abc-123',
      timestamp: '2026-06-12T08:00:00Z',
      silenced: true,
      acknowledged: false,
      canSilence: true,
      canAcknowledge: true,
    });
  });

  it('leaves the optional fields undefined for a bare v1 notification', () => {
    const { notifications } = setup({
      'notifications.x': { state: 'warn', method: ['visual'], message: 'Bare' },
    });
    const [n] = notifications.list();
    expect(n.id).toBeUndefined();
    expect(n.timestamp).toBeUndefined();
    expect(n.silenced).toBeUndefined();
    expect(n.acknowledged).toBeUndefined();
  });

  it('skips malformed values without throwing', () => {
    const { notifications } = setup({
      'notifications.bogus': { state: 42, method: 'sound' },
      'notifications.junk-method': { state: 'alarm', method: ['visual', 7], message: 3 },
    });
    const list = notifications.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ path: 'notifications.junk-method', method: ['visual'] });
    expect(list[0].message).toBe('');
  });

  it('memoizes the list until the store version moves', () => {
    const { store, notifications } = setup({
      'notifications.x': { state: 'warn', method: [], message: 'W' },
    });
    const first = notifications.list();
    expect(notifications.list()).toBe(first);
    store.applyFrame(frame({ 'notifications.x': null }));
    expect(notifications.list()).toHaveLength(0);
    expect(notifications.version).toBe(store.notificationsVersion);
  });

  it('removes the MOB notification when the clear value is published', () => {
    // Publish an emergency MOB notification into the store, then clear it with a normal state.
    // The clear matches what mobClearNotification() returns: state 'normal', which the store
    // deletes from the notifications mirror (the mirror holds only raised states).
    const mobPath = 'notifications.mob';
    const store = new SignalKStore();
    store.applyFrame(
      frame({ [mobPath]: { state: 'emergency', method: ['visual', 'sound'], message: 'MOB' } }),
    );
    const notifications = new NotificationsStore(store);
    expect(notifications.list().some((n) => n.path === mobPath)).toBe(true);
    // Publish the clear value: state 'normal' is not a raised grade, so the store removes it.
    store.applyFrame(
      frame({ [mobPath]: { state: 'normal', method: [], message: 'Man overboard cleared' } }),
    );
    expect(notifications.list().some((n) => n.path === mobPath)).toBe(false);
  });
});
