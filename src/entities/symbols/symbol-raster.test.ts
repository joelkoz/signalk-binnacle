import { describe, expect, it } from 'vitest';
import { mapThemePaint } from '$shared/map';
import { anchorOffset, rasterizeSymbolSvg } from './symbol-raster';

describe('anchorOffset', () => {
  it('returns no offset when the symbol declares no anchor', () => {
    expect(anchorOffset(24, 24, 1, undefined)).toEqual([0, 0]);
  });

  it('lifts a bottom-center pin anchor so the tip sits on the point', () => {
    expect(anchorOffset(24, 24, 1, [12, 24])).toEqual([0, -12]);
  });

  it('keeps a center anchor centered', () => {
    expect(anchorOffset(30, 30, 1, [15, 15])).toEqual([0, 0]);
  });

  it('scales the anchor with the symbol scale', () => {
    // A 40x40 source at scale 0.5 displays 20x20; anchor [1, 37] in source pixels.
    expect(anchorOffset(20, 20, 0.5, [1, 37])).toEqual([9.5, -8.5]);
  });
});

describe('rasterizeSymbolSvg', () => {
  it('returns null in the node environment so callers degrade to built-in icons', async () => {
    expect(await rasterizeSymbolSvg('<svg/>', 1, mapThemePaint('day'))).toBeNull();
  });
});
