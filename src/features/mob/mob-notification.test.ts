import { describe, expect, it } from 'vitest';
import { mobClearNotification, mobNotification } from './mob-notification';

describe('mob notifications', () => {
  it('raises an emergency with sound and the mark position', () => {
    const value = mobNotification({ latitude: 36.8, longitude: -121.79 });
    expect(value.state).toBe('emergency');
    expect(value.method).toContain('sound');
    expect(value.position).toEqual({ latitude: 36.8, longitude: -121.79 });
    expect(value.message).toContain('Man overboard');
  });

  it('clears to normal with no methods', () => {
    const value = mobClearNotification();
    expect(value.state).toBe('normal');
    expect(value.method).toEqual([]);
  });
});
