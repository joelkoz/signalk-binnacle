import { describe, expect, it } from 'vitest';
import { decodeMayara } from './radar-protocol';
import { syntheticFrames } from './synthetic-radar';

describe('syntheticFrames', () => {
  it('emits frames that decode to spokes covering the revolution (clean)', () => {
    const frames = syntheticFrames({ spokesPerRev: 16, maxSpokeLen: 8, pathology: 'clean' });
    const angles = new Set<number>();
    for (const frame of frames) for (const s of decodeMayara(frame).spokes) angles.add(s.angle);
    expect(angles.size).toBe(16);
  });

  it('reduce: reports a high spoke count but sends about a quarter of the angles', () => {
    const frames = syntheticFrames({ spokesPerRev: 16, maxSpokeLen: 8, pathology: 'reduce' });
    const angles = new Set<number>();
    for (const frame of frames) for (const s of decodeMayara(frame).spokes) angles.add(s.angle);
    expect(angles.size).toBeLessThan(16);
    expect(angles.size).toBeGreaterThan(0);
  });

  it('double: emits each angle twice', () => {
    const frames = syntheticFrames({ spokesPerRev: 8, maxSpokeLen: 4, pathology: 'double' });
    const counts = new Map<number, number>();
    for (const frame of frames) {
      for (const s of decodeMayara(frame).spokes)
        counts.set(s.angle, (counts.get(s.angle) ?? 0) + 1);
    }
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
  });
});
