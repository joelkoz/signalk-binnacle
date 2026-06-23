import { describe, expect, it } from 'vitest';
import { headingSpokes, spokesToRadians, writeSpoke } from './radar-math';

describe('writeSpoke', () => {
  it('writes data at the angular slot and zero-fills the remainder of the slot', () => {
    const spokesPerRev = 4;
    const maxSpokeLen = 3;
    const buffer = new Uint8Array(spokesPerRev * maxSpokeLen).fill(99);
    writeSpoke(buffer, spokesPerRev, maxSpokeLen, {
      angle: 2,
      range: 100,
      data: new Uint8Array([5, 6]),
    });
    expect(Array.from(buffer.slice(6, 9))).toEqual([5, 6, 0]);
    expect(buffer[0]).toBe(99);
  });

  it('clamps an over-length data array to maxSpokeLen', () => {
    const buffer = new Uint8Array(2 * 4);
    writeSpoke(buffer, 2, 4, { angle: 1, range: 1, data: new Uint8Array([1, 2, 3, 4, 5, 6]) });
    expect(Array.from(buffer.slice(4, 8))).toEqual([1, 2, 3, 4]);
  });
});

describe('headingSpokes', () => {
  it('derives heading as (bearing - angle) wrapped into the revolution', () => {
    expect(headingSpokes(10, 10, 2048)).toBe(0);
    expect(headingSpokes(100, 50, 2048)).toBe(2048 - 50);
    expect(headingSpokes(0, 512, 2048)).toBe(512);
  });
});

describe('spokesToRadians', () => {
  it('maps a quarter revolution to half pi', () => {
    expect(spokesToRadians(512, 2048)).toBeCloseTo(Math.PI / 2, 12);
  });
});
