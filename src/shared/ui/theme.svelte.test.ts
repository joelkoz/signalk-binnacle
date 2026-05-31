import { describe, expect, it } from 'vitest';
import { THEMES, ThemeController } from './theme.svelte';

describe('ThemeController', () => {
  it('defaults to day', () => {
    const c = new ThemeController(null, () => {});
    expect(c.theme).toBe('day');
  });

  it('restores a persisted theme', () => {
    const c = new ThemeController('night-red', () => {});
    expect(c.theme).toBe('night-red');
  });

  it('ignores an invalid persisted value', () => {
    const c = new ThemeController('bogus', () => {});
    expect(c.theme).toBe('day');
  });

  it('applies the initial theme on construction', () => {
    const applied: string[] = [];
    const c = new ThemeController('dusk', (t) => applied.push(t));
    expect(c.theme).toBe('dusk');
    expect(applied).toEqual(['dusk']);
  });

  it('set writes through the apply callback and persists', () => {
    const applied: string[] = [];
    const saved: string[] = [];
    const c = new ThemeController(
      null,
      (t) => applied.push(t),
      (t) => saved.push(t),
    );
    c.set('dusk');
    expect(c.theme).toBe('dusk');
    expect(applied).toContain('dusk');
    expect(saved).toContain('dusk');
  });

  it('cycle advances through the theme list and wraps', () => {
    const c = new ThemeController('day', () => {});
    c.cycle();
    expect(c.theme).toBe(THEMES[1]);
    c.set(THEMES[THEMES.length - 1]);
    c.cycle();
    expect(c.theme).toBe(THEMES[0]);
  });
});
