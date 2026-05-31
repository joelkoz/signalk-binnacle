import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullJitterDelay } from './backoff';

afterEach(() => vi.restoreAllMocks());

describe('fullJitterDelay', () => {
  it('returns a value in [0, base * 2^attempt) below the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(fullJitterDelay(0, 500, 30000)).toBe(250);
    expect(fullJitterDelay(1, 500, 30000)).toBe(500);
    expect(fullJitterDelay(2, 500, 30000)).toBe(1000);
  });

  it('never exceeds the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(fullJitterDelay(20, 500, 30000)).toBeLessThanOrEqual(30000);
  });

  it('returns 0 when random returns 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(fullJitterDelay(5, 500, 30000)).toBe(0);
  });
});
