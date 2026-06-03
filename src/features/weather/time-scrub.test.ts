import { describe, expect, it } from 'vitest';
import { advancePlay, clampTime, stepTime } from './time-scrub';

const range = { start: 1000, end: 5000, stepMs: 1000 };

describe('time-scrub', () => {
  it('clamps to the range', () => {
    expect(clampTime(0, range)).toBe(1000);
    expect(clampTime(9999, range)).toBe(5000);
    expect(clampTime(2500, range)).toBe(2500);
  });
  it('steps by stepMs and clamps at the ends', () => {
    expect(stepTime(2000, 1, range)).toBe(3000);
    expect(stepTime(5000, 1, range)).toBe(5000);
    expect(stepTime(1000, -1, range)).toBe(1000);
  });
  it('advances play and wraps to the start past the end', () => {
    expect(advancePlay(4000, range)).toBe(5000);
    expect(advancePlay(5000, range)).toBe(1000);
  });
});
