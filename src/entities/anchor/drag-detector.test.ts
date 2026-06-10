import { describe, expect, it } from 'vitest';
import { DragDetector } from './drag-detector';

describe('DragDetector', () => {
  it('declares a drag only after three consecutive breaches', () => {
    const detector = new DragDetector();
    expect(detector.update(true)).toBe(false);
    expect(detector.update(true)).toBe(false);
    expect(detector.update(true)).toBe(true);
  });

  it('one fix back inside resets the count, so scatter does not accumulate', () => {
    const detector = new DragDetector();
    detector.update(true);
    detector.update(true);
    expect(detector.update(false)).toBe(false);
    expect(detector.update(true)).toBe(false);
    expect(detector.update(true)).toBe(false);
    expect(detector.update(true)).toBe(true);
  });

  it('reset() restarts the breach window', () => {
    const detector = new DragDetector();
    detector.update(true);
    detector.update(true);
    detector.reset();
    expect(detector.update(true)).toBe(false);
  });

  it('keeps reporting the drag while the breaches continue', () => {
    const detector = new DragDetector();
    detector.update(true);
    detector.update(true);
    detector.update(true);
    expect(detector.update(true)).toBe(true);
  });
});
