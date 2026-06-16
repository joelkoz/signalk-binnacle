import { describe, expect, it } from 'vitest';
import { isTabKey } from './focus';

function keyEvent(key: string, shiftKey = false): KeyboardEvent {
  return { key, shiftKey } as KeyboardEvent;
}

describe('isTabKey', () => {
  it('returns true for Tab', () => {
    expect(isTabKey(keyEvent('Tab'))).toBe(true);
  });

  it('returns true for Shift+Tab', () => {
    expect(isTabKey(keyEvent('Tab', true))).toBe(true);
  });

  it('returns false for Enter', () => {
    expect(isTabKey(keyEvent('Enter'))).toBe(false);
  });

  it('returns false for arrow keys', () => {
    expect(isTabKey(keyEvent('ArrowDown'))).toBe(false);
    expect(isTabKey(keyEvent('ArrowUp'))).toBe(false);
    expect(isTabKey(keyEvent('ArrowLeft'))).toBe(false);
    expect(isTabKey(keyEvent('ArrowRight'))).toBe(false);
  });

  it('returns false for Escape', () => {
    expect(isTabKey(keyEvent('Escape'))).toBe(false);
  });
});
