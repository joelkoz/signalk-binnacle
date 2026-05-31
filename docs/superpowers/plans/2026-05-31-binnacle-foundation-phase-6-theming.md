# Binnacle Foundation, Phase 6: Shell and Day/Dusk/Night-Red Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give Binnacle a design-token theme system with three palettes (day, dusk, and night-red) switchable from one control, applied to every surface (shell, status strip, layers panel) and to the map, with night-red as pure red on true black. Prove it: a theme toggle in the top bar switches `data-theme` on the document, the chrome recolors instantly, and the map base recolors without losing overlays.

**Architecture:** A CSS custom-property token set, defined once in `app.css` under `:root` (day) plus `[data-theme="dusk"]` and `[data-theme="night-red"]` blocks. Every component color becomes a `var(--token)`, so a theme switch is a single attribute change with zero per-component logic. A tiny `theme` module in `shared/ui` holds the current theme as a runes signal, persists the choice, and writes `data-theme` on `document.documentElement`. The map recolors via MapLibre `setPaintProperty` on the base style's background and water layers (cheap, keeps tiles and overlays), driven from the same signal. The own-vessel and AIS icons stay as-is this phase (their S-52 restyle is Phase 7). This realizes design spec section 8 (theming): day bright, dusk cool and dimmed, night-red pure red on true black, no blue at night, alarm states distinguishable, brightest pixel low.

**Tech Stack:** Svelte 5 runes, TypeScript, CSS custom properties, the existing `shared/map` LayerManager and `maplibre-gl`. Biome, svelte-check, Vitest, Playwright, dependency-cruiser.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy command at a time. Lead-driven, never commit or push on red (hooks enforce). Ends with the `/cleanup` skill and a doc gate.

---

## Module boundary note

- `src/shared/ui/theme.svelte.ts` : the theme signal, the theme list, persistence, and the `data-theme` writer. Generic, imports nothing above `shared`. Add `src/shared/ui/index.ts` (the `shared/ui` segment currently holds only a `.gitkeep`).
- `src/shared/map/` : a `mapThemePaint(theme)` helper returning the base background and water colors per theme, applied by the canvas. Imports only `shared`.
- `src/features/theme-toggle/` : a small `ThemeToggle.svelte` cycling the theme, plus its `index.ts`. A `features` slice; imports `shared`.
- `src/app/App.svelte`, `src/features/layers-panel/LayersPanel.svelte`, `src/widgets/chart-canvas/ChartCanvas.svelte` : replace hardcoded colors with tokens, render the toggle, and recolor the map on theme change.
- `src/app.css` : the token definitions and the three theme blocks.

dependency-cruiser stays green.

---

## Token vocabulary

Defined in `app.css`. The same names exist in all three themes; only the values differ.

- `--surface` : app background.
- `--surface-raised` : panels, top bar, status strip background.
- `--surface-overlay` : translucent floating panel background.
- `--border` : hairlines and dividers.
- `--text` : primary text.
- `--text-muted` : secondary text and labels.
- `--accent` : interactive accent (toggles, sliders, the brand).
- `--alarm` : alarm and danger color (must stay distinguishable in every theme).
- `--map-background` : the map void color behind tiles.
- `--map-water` : the water fill recolor.

Day: light, high brightness. Dusk: cool and dimmed. Night-red: true black surfaces (`#000`), red text and accent (`#c8362a` to `#e0473a`), no blue, alarm a brighter red (`#ff6a5a`) that still reads against black.

---

## Task 1: Define the tokens and the three theme blocks

**Files:** modify `src/app.css`.

- [ ] **Step 1:** Replace `app.css` with the token system (keep the MapLibre CSS import and the reset):
```css
@import 'maplibre-gl/dist/maplibre-gl.css';

:root {
  color-scheme: dark;

  --surface: #cfe0ec;
  --surface-raised: #ffffff;
  --surface-overlay: rgba(255, 255, 255, 0.85);
  --border: #aac3d6;
  --text: #0b2233;
  --text-muted: #4a6378;
  --accent: #1f6fb2;
  --alarm: #c8401f;
  --map-background: #aecbe0;
  --map-water: #a8c9e0;
}

:root[data-theme='dusk'] {
  color-scheme: dark;

  --surface: #0f1a24;
  --surface-raised: #10212e;
  --surface-overlay: rgba(13, 24, 33, 0.85);
  --border: #233646;
  --text: #bcd2e4;
  --text-muted: #7f9bb3;
  --accent: #2c6da3;
  --alarm: #e0703a;
  --map-background: #0a151f;
  --map-water: #10212e;
}

:root[data-theme='night-red'] {
  color-scheme: dark;

  --surface: #000000;
  --surface-raised: #0a0000;
  --surface-overlay: rgba(8, 0, 0, 0.88);
  --border: #3a0c08;
  --text: #c8362a;
  --text-muted: #8e2a22;
  --accent: #e0473a;
  --alarm: #ff6a5a;
  --map-background: #000000;
  --map-water: #140402;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

#app {
  block-size: 100vh;
}
```

- [ ] **Step 2:** `biome ci .` (CSS is checked). Commit `feat(theme): define day, dusk, and night-red tokens`.

---

## Task 2: The theme signal

**Files:** create `src/shared/ui/theme.svelte.ts`, `theme.svelte.test.ts`, `src/shared/ui/index.ts`; remove `src/shared/ui/.gitkeep`.

- [ ] **Step 1: Failing test.** Create `theme.svelte.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
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

  it('set writes through the apply callback and persists', () => {
    const applied: string[] = [];
    const saved: string[] = [];
    const c = new ThemeController(null, (t) => applied.push(t), (t) => saved.push(t));
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
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement.** Create `theme.svelte.ts`:
```ts
export const THEMES = ['day', 'dusk', 'night-red'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'binnacle:theme';

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export class ThemeController {
  theme = $state<Theme>('day');

  #apply: (theme: Theme) => void;
  #persist: (theme: Theme) => void;

  constructor(
    initial: string | null,
    apply: (theme: Theme) => void,
    persist: (theme: Theme) => void = () => {},
  ) {
    this.#apply = apply;
    this.#persist = persist;
    if (isTheme(initial)) this.theme = initial;
    this.#apply(this.theme);
  }

  set(theme: Theme): void {
    this.theme = theme;
    this.#apply(theme);
    this.#persist(theme);
  }

  cycle(): void {
    const next = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
    this.set(next);
  }
}

// Wires a ThemeController to the document and localStorage for app use.
export function createThemeController(onApply?: (theme: Theme) => void): ThemeController {
  const initial =
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return new ThemeController(
    initial,
    (theme) => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = theme;
      }
      onApply?.(theme);
    },
    (theme) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
    },
  );
}
```

- [ ] **Step 4:** Run, expect PASS (5).

- [ ] **Step 5:** Create `src/shared/ui/index.ts`:
```ts
export { createThemeController, ThemeController, THEMES } from './theme.svelte';
export type { Theme } from './theme.svelte';
```
Remove the placeholder: `git rm src/shared/ui/.gitkeep`.

- [ ] **Step 6:** `npm run check`, `npm run cruise`, commit `feat(theme): theme controller signal with persistence`.

---

## Task 3: Map theme paint helper

**Files:** create `src/shared/map/map-theme.ts`, `map-theme.test.ts`; modify `src/shared/map/index.ts`.

- [ ] **Step 1: Failing test.** Create `map-theme.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mapThemePaint } from './map-theme';

describe('mapThemePaint', () => {
  it('returns a background and water color for each theme', () => {
    for (const theme of ['day', 'dusk', 'night-red'] as const) {
      const paint = mapThemePaint(theme);
      expect(typeof paint.background).toBe('string');
      expect(typeof paint.water).toBe('string');
    }
  });

  it('night-red uses black background', () => {
    expect(mapThemePaint('night-red').background).toBe('#000000');
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement.** Create `map-theme.ts`:
```ts
import type { Theme } from '$shared/ui';

export interface MapThemePaint {
  background: string;
  water: string;
}

const PAINT: Record<Theme, MapThemePaint> = {
  day: { background: '#aecbe0', water: '#a8c9e0' },
  dusk: { background: '#0a151f', water: '#10212e' },
  'night-red': { background: '#000000', water: '#140402' },
};

export function mapThemePaint(theme: Theme): MapThemePaint {
  return PAINT[theme];
}
```
NOTE: this imports a TYPE from `$shared/ui`, which is a same-layer (`shared` to `shared`) import and allowed by dependency-cruiser's `shared-imports-nothing-above` rule (it only forbids importing layers ABOVE shared). Confirm cruise stays green; if a stricter intra-shared rule were added later, move `Theme` to a lower-level types module. For now `shared/map` importing `shared/ui`'s type is fine.

- [ ] **Step 4:** Run, expect PASS (2). Export from `src/shared/map/index.ts`:
```ts
export { mapThemePaint } from './map-theme';
export type { MapThemePaint } from './map-theme';
```

- [ ] **Step 5:** `npm run cruise`, commit `feat(map): per-theme base paint helper`.

---

## Task 4: Apply tokens to the shell, panel, and toggle

**Files:** create `src/features/theme-toggle/ThemeToggle.svelte`, `index.ts`; modify `App.svelte`, `LayersPanel.svelte`.

- [ ] **Step 1: The toggle component.** Create `src/features/theme-toggle/ThemeToggle.svelte`:
```svelte
<script lang="ts">
  import type { ThemeController } from '$shared/ui';

  interface Props {
    controller: ThemeController;
  }

  const { controller }: Props = $props();

  const LABELS: Record<string, string> = {
    day: 'Day',
    dusk: 'Dusk',
    'night-red': 'Night',
  };
</script>

<button type="button" class="theme-toggle" onclick={() => controller.cycle()}>
  {LABELS[controller.theme] ?? controller.theme}
</button>

<style>
.theme-toggle {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
}
.theme-toggle:hover {
  border-color: var(--accent);
}
</style>
```

- [ ] **Step 2:** Create `src/features/theme-toggle/index.ts`:
```ts
export { default as ThemeToggle } from './ThemeToggle.svelte';
```

- [ ] **Step 3: Tokenize and wire `App.svelte`.** In the script, create the controller and recolor the map through a callback the canvas exposes. Add a top-bar layout with the brand and the toggle. Replace every hardcoded color in the `<style>` with the tokens. Concretely:
  - Import: `import { createThemeController } from '$shared/ui';` and `import { ThemeToggle } from '$features/theme-toggle';`.
  - Add `let onThemeChange = $state<((theme: string) => void) | undefined>();` and `const theme = createThemeController((t) => onThemeChange?.(t));`. (The canvas registers its recolor function via a bindable so App does not import map internals.)
  - Pass `onMapReady={(recolor) => { onThemeChange = recolor; recolor(theme.theme); }}` to `ChartCanvas` (see Task 5).
  - Top bar markup:
    ```svelte
    <header class="topbar">
      <span class="brand">Binnacle</span>
      <ThemeToggle controller={theme} />
    </header>
    ```
  - Style: `.binnacle-shell { background: var(--surface); color: var(--text); }`, `.topbar { display: flex; align-items: center; justify-content: space-between; border-block-end: 1px solid var(--border); }`, `.brand { font-weight: 600; }`, `.status-strip { border-block-start: 1px solid var(--border); color: var(--text-muted); }`, `.readout b { color: var(--text); }`. Add a `.status-strip .alarm { color: var(--alarm); }` class available for later use. Keep the existing layout grid and spacing.

- [ ] **Step 4: Tokenize `LayersPanel.svelte`.** Replace the hardcoded colors in its `<style>`: `.layers-panel { background: var(--surface-overlay); border: 1px solid var(--border); color: var(--text); }`, `.heading { color: var(--text-muted); }`, `.empty { color: var(--text-muted); }`. Keep the layout.

- [ ] **Step 5:** `npm run check`, `npm run cruise`. Green. (Build and tokens verified in Task 6.)

- [ ] **Step 6:** Commit `feat(theme): tokenize the shell and panel, add the theme toggle`.

---

## Task 5: Recolor the map on theme change

**Files:** modify `src/widgets/chart-canvas/ChartCanvas.svelte`.

- [ ] **Step 1:** Expose a recolor function to the parent and apply it. Add to `Props`:
```ts
  onMapReady?: (recolor: (theme: string) => void) => void;
```
After the map loads and overlays register, define a recolor closure and hand it up:
```ts
import { mapThemePaint, ... } from '$shared/map';
import type { Theme } from '$shared/ui';
...
    const recolor = (theme: string) => {
      const paint = mapThemePaint(theme as Theme);
      const style = mapInstance.getStyle();
      for (const layer of style.layers) {
        if (layer.type === 'background') {
          mapInstance.setPaintProperty(layer.id, 'background-color', paint.background);
        }
        if (layer.id.includes('water')) {
          mapInstance.setPaintProperty(layer.id, 'fill-color', paint.water);
        }
      }
    };
    onMapReady?.(recolor);
```
NOTE: the OpenFreeMap "liberty" style names its water fill layers with `water` in the id; the `includes('water')` guard is intentionally permissive and a setPaintProperty on a non-existent property is wrapped in a try/catch to tolerate base styles that differ:
```ts
    const recolor = (theme: string) => {
      const paint = mapThemePaint(theme as Theme);
      let style: ReturnType<typeof mapInstance.getStyle>;
      try {
        style = mapInstance.getStyle();
      } catch {
        return;
      }
      for (const layer of style.layers ?? []) {
        try {
          if (layer.type === 'background') {
            mapInstance.setPaintProperty(layer.id, 'background-color', paint.background);
          } else if (layer.id.includes('water') && layer.type === 'fill') {
            mapInstance.setPaintProperty(layer.id, 'fill-color', paint.water);
          }
        } catch {
          // A base style without this layer or property is fine; skip it.
        }
      }
    };
    onMapReady?.(recolor);
```

- [ ] **Step 2:** `npm run check`. Green. Commit `feat(map): recolor the base on theme change`.

---

## Task 6: Full local gate

Run each heavy command alone, capture to a file, read it back:
- [ ] `biome ci .`
- [ ] `npm run cruise`
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `NODE_ENV=production npm run build`
- [ ] `npm run test:e2e` (the smoke test still asserts the brand and status text, which remain; the theme toggle adds a button but does not change those).

All green before committing.

---

## Task 7: Cleanup gate and phase close

- [ ] **Step 1:** Run `/cleanup` against the Phase 6 diff (inline lead audit), brief on the style rules. Look specifically for any remaining hardcoded hex colors in components that should be tokens.
- [ ] **Step 2:** Fix every finding, including nit.
- [ ] **Step 3: Doc gate.** Add the Phase 6 CHANGELOG entry. Update the README status (three themes, switchable, night-red preserves dark adaptation). Rebuild before quoting any bundle figure. Confirm CLAUDE.md still matches (the night-red contract is already documented there).
- [ ] **Step 4:** Re-run the full gate. Commit and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** The toggle cycles day, dusk, and night-red; `data-theme` changes on the document; the shell, status strip, and layers panel recolor from tokens; the map base recolors; night-red is pure red on true black with no blue; the theme controller and map-theme helper are unit-tested; dependency-cruiser confirms boundaries.

When all are true, Phase 6 is complete and Phase 7 (the identity pass: S-52 sprite atlas, Inter and JetBrains Mono fonts, Lucide chrome icons, and copy) can begin, which is the final foundation phase.

---

## Self-review notes

- **Spec coverage:** implements design spec section 8 (theming): three palettes as design tokens switched by one signal, night-red pure red on true black, no blue at night (the night-red block uses only reds and black), alarm distinguishable (a dedicated `--alarm` token brighter than the text red), and the map recolored at the layer level via setPaintProperty rather than a CSS canvas filter (preserves overlays and tile data, per the design). Persistence via localStorage means the chosen theme survives reloads, which suits the always-on helm display.
- **Deferred, recorded:** automatic theme switching tied to ambient light or sunrise/sunset (a later enhancement; this phase ships the manual toggle), the OpenBridge component library adoption (the tokens follow its palette intent without pulling the dependency yet), and the three-mode shell (Watch, Anchor, Inhabit), which the hybrid-shell decision deferred to its own differentiator spec.
- **Boundary note:** `shared/map/map-theme.ts` imports the `Theme` type from `shared/ui`, a same-layer import that dependency-cruiser allows (the rule forbids only importing layers above shared). Verified in Task 3.
- **Type and name consistency:** `Theme`, `THEMES`, `ThemeController`, `createThemeController`, `mapThemePaint`, and `MapThemePaint` are used identically across tasks. The token names match between `app.css` and every component.
- **Verify before push:** every heavy command runs alone and is read from a file before any commit; the hooks enforce green.
