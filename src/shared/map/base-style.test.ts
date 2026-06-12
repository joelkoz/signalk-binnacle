import { describe, expect, it } from 'vitest';
import { baseStyleUrl, fallbackBaseStyle } from './base-style';

describe('fallbackBaseStyle', () => {
  it('is a valid one-layer style so the map can fire load without any network', () => {
    const style = fallbackBaseStyle();
    expect(style.version).toBe(8);
    expect(style.sources).toEqual({});
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]).toMatchObject({ id: 'background', type: 'background' });
  });

  it('declares glyphs from the base host so symbol layers with text can still be added', () => {
    const style = fallbackBaseStyle();
    expect(style.glyphs).toContain('{fontstack}');
    expect(new URL(style.glyphs as string).host).toBe(new URL(baseStyleUrl()).host);
  });
});
