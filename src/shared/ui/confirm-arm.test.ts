import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmArm } from './confirm-arm.svelte';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ConfirmArm', () => {
  it('arms on the first tap and fires only on the second', () => {
    const arm = new ConfirmArm();
    expect(arm.tap()).toBe(false);
    expect(arm.armed).toBe(true);
    expect(arm.tap()).toBe(true);
    expect(arm.armed).toBe(false);
  });

  it('disarms on timeout, so a late tap re-arms instead of firing', () => {
    const arm = new ConfirmArm();
    arm.tap();
    vi.advanceTimersByTime(5_000);
    expect(arm.armed).toBe(false);
    expect(arm.tap()).toBe(false);
  });

  it('disarm cancels the pending window', () => {
    const arm = new ConfirmArm();
    arm.tap();
    arm.disarm();
    expect(arm.armed).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(arm.tap()).toBe(false);
  });
});
