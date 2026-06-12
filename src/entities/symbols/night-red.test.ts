import { describe, expect, it } from 'vitest';
import { mapLuminanceToRed, NIGHT_RED_ALPHA } from './night-red';

describe('mapLuminanceToRed', () => {
  it('maps white to full red with dimmed alpha', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    mapLuminanceToRed(data);
    expect([...data]).toEqual([255, 0, 0, Math.round(255 * NIGHT_RED_ALPHA)]);
  });

  it('maps pure green and blue through their luma weights into the red channel', () => {
    const data = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255]);
    mapLuminanceToRed(data);
    expect([...data.slice(0, 4)]).toEqual([Math.round(0.7152 * 255), 0, 0, 204]);
    expect([...data.slice(4, 8)]).toEqual([Math.round(0.0722 * 255), 0, 0, 204]);
  });

  it('keeps black and fully transparent pixels at zero', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 120, 200, 50, 0]);
    mapLuminanceToRed(data);
    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 204]);
    expect(data[7]).toBe(0);
  });

  it('processes every pixel of a longer buffer in place', () => {
    const data = new Uint8ClampedArray(16).fill(255);
    mapLuminanceToRed(data);
    for (let i = 0; i < 16; i += 4) {
      expect([...data.slice(i, i + 4)]).toEqual([255, 0, 0, 204]);
    }
  });
});
