import { afterEach, describe, expect, it, vi } from 'vitest';
import { gibsDate } from './gibs-date';

afterEach(() => {
  vi.useRealTimers();
});

describe('gibsDate', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(gibsDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns yesterday in UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T05:00:00Z'));
    expect(gibsDate()).toBe('2026-06-07');
  });

  it('rolls back across a month boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:30:00Z'));
    expect(gibsDate()).toBe('2026-06-30');
  });
});
