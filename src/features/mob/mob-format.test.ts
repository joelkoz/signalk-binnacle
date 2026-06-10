import { describe, expect, it } from 'vitest';
import { formatElapsed } from './mob-format';

describe('formatElapsed', () => {
  it('formats minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(95)).toBe('1:35');
    expect(formatElapsed(3599)).toBe('59:59');
  });

  it('adds hours past sixty minutes', () => {
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });
});
