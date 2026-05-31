# Binnacle Foundation, Phase 1: Project Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Amendment (2026-05-31):** This phase shipped with Biome 2.4.16 in place of ESLint and Prettier, per project preference. Task 5 (ESLint) and Task 7 (Prettier) are superseded: lint and format are `biome lint .` and `biome format --write .` configured in `biome.json`, using the system Biome binary (CI uses the `biomejs/setup-biome` action). Module-boundary enforcement consolidates onto dependency-cruiser alone (Task 6), since Biome has no `eslint-plugin-boundaries` equivalent. The CI gate (Task 10) runs `biome ci .`. Dependencies were taken to latest: Vite 8.0.14, TypeScript 6, Svelte 5.56, Vitest 4.1, Playwright 1.60, and dependency-cruiser 17.4 (the stable `@sveltejs/vite-plugin-svelte` 7.1.2 peers Vite 8). The type-check targets `tsconfig.app.json`.

**Goal:** Stand up a building, linting, type-checking, testing Signal K webapp skeleton on Svelte 5 + Vite + TypeScript with machine-enforced Feature-Sliced Design boundaries, so every later phase ships through a working gate.

**Architecture:** A client-only Vite SPA (no SvelteKit) scaffolded with the svelte-ts template, organized into Feature-Sliced Design layers (`app`, `views`, `widgets`, `features`, `entities`, `shared`) with downward-only imports enforced by path aliases, eslint-plugin-boundaries, and dependency-cruiser. The build emits into `public/` so the Signal K server serves it same-origin at `/binnacle/`. A real first vertical (the SI units module in `shared`) is built test-first to prove the Vitest pipeline and the boundary tooling end to end.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript, Vitest 4 (node project), Playwright (e2e), ESLint 9 flat config, eslint-plugin-boundaries, dependency-cruiser, Prettier.

**Project rules:** This plan honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy verification process at a time on the Pi (this is a Raspberry Pi 5; never run type-check, lint, test, or build concurrently). This whole phase is one "major step" under the build policy, so it ends with the `/cleanup` skill and a fix-everything-including-nit pass before the final commit.

**Environment note:** The Pi runs Node 24 (v24.15.0) with npm 11. The project advertises `engines.node >=22` because the Signal K reusable plugin-ci matrix tests the lowest advertised version, so write code and build scripts that pass on Node 22, even though the local dev runtime is 24. The default branch is `main`.

---

## File structure created in this phase

- `package.json` : Signal K webapp manifest, scripts, deps.
- `vite.config.ts` : build to `public/`, base `/binnacle/`, path aliases, Vitest config.
- `tsconfig.json`, `tsconfig.node.json` : strict TypeScript, path aliases mirrored.
- `svelte.config.js` : Svelte compiler config (vitePreprocess).
- `eslint.config.js` : flat config with TypeScript, Svelte, and boundaries rules.
- `.dependency-cruiser.cjs` : layer direction and no-circular rules.
- `.prettierrc`, `.prettierignore` : formatting.
- `index.html` : app entry, mount point.
- `src/main.ts` : mounts the root component.
- `src/app/App.svelte` : composition root, renders the shell skeleton.
- `src/shared/lib/units.ts` : SI to display unit conversions (first real module).
- `src/shared/lib/units.test.ts` : unit tests for the conversions.
- `src/shared/lib/index.ts` : public API for shared/lib.
- `static/` : Vite static assets (publicDir), holds the app icon.
- `e2e/smoke.spec.ts` : Playwright smoke test.
- `playwright.config.ts` : Playwright config.
- `.github/workflows/ci.yml` : CI gate.

---

## Task 1: Scaffold the Vite + Svelte 5 + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `svelte.config.js`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`, `src/app/App.svelte`

- [ ] **Step 1: Scaffold into the existing repo**

The repo already contains `docs/`, `CLAUDE.md`, `.gitignore`, and `.git`. Scaffold the Vite template, telling it to ignore the existing files.

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
npm create vite@latest . -- --template svelte-ts
```
When prompted "Current directory is not empty", choose **"Ignore files and continue"**. Do not choose remove.

Expected: Vite writes `package.json`, `vite.config.ts`, `tsconfig*.json`, `svelte.config.js`, `index.html`, `src/main.ts`, `src/App.svelte`, `src/app.css`, `src/lib/`, `src/assets/`, and `src/vite-env.d.ts`.

- [ ] **Step 2: Install the scaffolded dependencies**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
npm install
```
Expected: `node_modules/` is created, no errors. `npm ls svelte` shows Svelte 5.x.

- [ ] **Step 3: Verify the scaffold builds and the dev server starts**

Run:
```bash
npm run build
```
Expected: a successful build into `dist/` (we relocate this to `public/` in Task 2).

- [ ] **Step 4: Remove the template demo files we are replacing**

The template ships a counter demo. Remove it so the tree is clean.

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
rm -rf src/lib src/assets src/App.svelte
```
Expected: those paths are gone. `src/main.ts`, `src/app.css`, and `src/vite-env.d.ts` remain.

- [ ] **Step 5: Create the composition-root component**

Create `src/app/App.svelte`:
```svelte
<script lang="ts">
  // Composition root. Phase 1 renders only a skeleton; the shell arrives in Phase 6.
</script>

<main class="binnacle-shell">
  <header class="topbar">Binnacle</header>
  <section class="chart-host" aria-label="Chart">
    <p class="placeholder">Chart canvas mounts here in Phase 3.</p>
  </section>
  <footer class="status-strip">Not connected</footer>
</main>

<style>
  .binnacle-shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    block-size: 100vh;
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #06090d;
    color: #e7edf3;
  }
  .topbar {
    padding: 0.75rem 1rem;
    font-weight: 600;
    border-block-end: 1px solid #243140;
  }
  .chart-host {
    display: grid;
    place-items: center;
  }
  .placeholder {
    color: #6f8aa3;
  }
  .status-strip {
    padding: 0.5rem 1rem;
    border-block-start: 1px solid #243140;
    color: #6f8aa3;
  }
</style>
```

- [ ] **Step 6: Point main.ts at the new root**

Replace `src/main.ts` with:
```ts
import { mount } from 'svelte';
import './app.css';
import App from './app/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount element');

const app = mount(App, { target });

export default app;
```

- [ ] **Step 7: Update index.html mount id**

Edit `index.html` so the mount element id is `app` and the title is correct. Set the body to:
```html
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
```
And set `<title>Binnacle</title>` in the head.

- [ ] **Step 8: Reset app.css to a minimal reset**

Replace `src/app.css` with:
```css
:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 9: Verify the app builds and runs**

Run:
```bash
npm run build
```
Expected: build succeeds with the new entry. No reference errors to the deleted demo files.

- [ ] **Step 10: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "feat: scaffold Svelte 5 + Vite + TypeScript app skeleton"
```

---

## Task 2: Configure Vite for Signal K webapp delivery and FSD aliases

**Files:**
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`, `tsconfig.node.json`
- Create: `static/.gitkeep`

The Signal K server serves a webapp's `public/` directory at `/<package-name>/`. Vite normally treats `public/` as the static input folder and builds to `dist/`. We invert this: build output goes to `public/`, and Vite's static input folder becomes `static/`. Production base path is `/binnacle/`.

- [ ] **Step 1: Create the static assets folder**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
mkdir -p static && touch static/.gitkeep
```

- [ ] **Step 2: Rewrite vite.config.ts**

Replace `vite.config.ts` with:
```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const alias = {
  $app: fileURLToPath(new URL('./src/app', import.meta.url)),
  $views: fileURLToPath(new URL('./src/views', import.meta.url)),
  $widgets: fileURLToPath(new URL('./src/widgets', import.meta.url)),
  $features: fileURLToPath(new URL('./src/features', import.meta.url)),
  $entities: fileURLToPath(new URL('./src/entities', import.meta.url)),
  $shared: fileURLToPath(new URL('./src/shared', import.meta.url)),
};

export default defineConfig({
  // Signal K serves the webapp at /<package-name>/. Production assets must be relative to it.
  base: process.env.NODE_ENV === 'production' ? '/binnacle/' : '/',
  plugins: [svelte()],
  resolve: { alias },
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          exclude: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Add path aliases to tsconfig.json**

In `tsconfig.json`, inside `compilerOptions`, add `baseUrl` and `paths`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "$app/*": ["src/app/*"],
      "$views/*": ["src/views/*"],
      "$widgets/*": ["src/widgets/*"],
      "$features/*": ["src/features/*"],
      "$entities/*": ["src/entities/*"],
      "$shared/*": ["src/shared/*"]
    }
  }
}
```
Keep all existing template compiler options. Ensure `"strict": true` is present (the svelte-ts template sets it; verify).

- [ ] **Step 4: Verify type-check passes**

Run:
```bash
npm run check
```
(The svelte-ts template defines `check` as `svelte-check --tsconfig ./tsconfig.json`.)
Expected: no errors. If `check` is missing, add `"check": "svelte-check --tsconfig ./tsconfig.json"` to `package.json` scripts.

- [ ] **Step 5: Verify the production build emits to public/ with the right base**

Run:
```bash
NODE_ENV=production npm run build
```
Expected: output written to `public/`, and `public/index.html` references assets under `/binnacle/assets/...`.

- [ ] **Step 6: Verify dev server uses root base**

Run:
```bash
timeout 8 npm run dev || true
```
Expected: dev server starts and prints a local URL. (It is killed by timeout; we only confirm it starts.)

- [ ] **Step 7: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "build: emit to public/ for Signal K, add FSD path aliases"
```

---

## Task 3: Create the Feature-Sliced Design directory skeleton

**Files:**
- Create: `src/app/`, `src/views/`, `src/widgets/`, `src/features/`, `src/entities/`, `src/shared/` with `.gitkeep` placeholders and segment subfolders for `shared`.

- [ ] **Step 1: Create the layer folders**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
mkdir -p src/views src/widgets src/features src/entities \
  src/shared/lib src/shared/ui src/shared/geo src/shared/signalk src/shared/map src/shared/types
touch src/views/.gitkeep src/widgets/.gitkeep src/features/.gitkeep src/entities/.gitkeep \
  src/shared/ui/.gitkeep src/shared/geo/.gitkeep src/shared/signalk/.gitkeep \
  src/shared/map/.gitkeep src/shared/types/.gitkeep
```
Expected: the six FSD layers exist, with `shared` split into segments.

- [ ] **Step 2: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "chore: create Feature-Sliced Design layer skeleton"
```

---

## Task 4: Build the SI units module test-first (first real vertical)

This proves the Vitest pipeline and gives `shared/lib` a real public API. The store keeps Signal K SI values; these helpers convert at the display edge. Recall from the spec: angles are radians, speed is m/s, depth is meters, temperature is Kelvin, and `navigation.position` is already decimal degrees so it needs no conversion.

**Files:**
- Create: `src/shared/lib/units.ts`
- Test: `src/shared/lib/units.test.ts`
- Create: `src/shared/lib/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/lib/units.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  metersPerSecondToKnots,
  radiansToDegrees,
  kelvinToCelsius,
  metersToFeet,
  metersToNauticalMiles,
} from './units';

describe('units', () => {
  it('converts meters per second to knots', () => {
    expect(metersPerSecondToKnots(1)).toBeCloseTo(1.943844, 5);
    expect(metersPerSecondToKnots(0)).toBe(0);
  });

  it('returns undefined for undefined input', () => {
    expect(metersPerSecondToKnots(undefined)).toBeUndefined();
    expect(radiansToDegrees(undefined)).toBeUndefined();
  });

  it('converts radians to a normalized 0..360 degree bearing', () => {
    expect(radiansToDegrees(0)).toBe(0);
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 6);
    expect(radiansToDegrees(2 * Math.PI)).toBeCloseTo(0, 6);
    expect(radiansToDegrees(-Math.PI / 2)).toBeCloseTo(270, 6);
  });

  it('converts kelvin to celsius', () => {
    expect(kelvinToCelsius(273.15)).toBeCloseTo(0, 6);
    expect(kelvinToCelsius(293.15)).toBeCloseTo(20, 6);
  });

  it('converts meters to feet', () => {
    expect(metersToFeet(1)).toBeCloseTo(3.28084, 5);
  });

  it('converts meters to nautical miles', () => {
    expect(metersToNauticalMiles(1852)).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/shared/lib/units.test.ts
```
Expected: FAIL, cannot resolve `./units` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/shared/lib/units.ts`:
```ts
const MS_TO_KNOTS = 1.943844492;
const METERS_TO_FEET = 3.280839895;
const METERS_PER_NAUTICAL_MILE = 1852;

export function metersPerSecondToKnots(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value * MS_TO_KNOTS;
}

export function radiansToDegrees(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return ((value * 180) / Math.PI + 360) % 360;
}

export function kelvinToCelsius(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value - 273.15;
}

export function metersToFeet(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value * METERS_TO_FEET;
}

export function metersToNauticalMiles(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / METERS_PER_NAUTICAL_MILE;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/shared/lib/units.test.ts
```
Expected: PASS, 6 tests green.

- [ ] **Step 5: Create the shared/lib public API**

Create `src/shared/lib/index.ts`:
```ts
export {
  metersPerSecondToKnots,
  radiansToDegrees,
  kelvinToCelsius,
  metersToFeet,
  metersToNauticalMiles,
} from './units';
```

- [ ] **Step 6: Wire the test script and confirm the unit project runs**

Ensure `package.json` scripts include:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Run:
```bash
npm test
```
Expected: the `unit` project runs and the units tests pass.

- [ ] **Step 7: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "feat: add SI unit conversions in shared/lib with tests"
```

---

## Task 5: ESLint flat config with TypeScript, Svelte, and boundary rules

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (scripts, devDependencies)

- [ ] **Step 1: Install ESLint and plugins**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-svelte svelte-eslint-parser eslint-plugin-boundaries eslint-config-prettier globals
```
Expected: installed without peer errors.

- [ ] **Step 2: Write the flat config**

Create `eslint.config.js`:
```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/*' },
        { type: 'views', pattern: 'src/views/*' },
        { type: 'widgets', pattern: 'src/widgets/*' },
        { type: 'features', pattern: 'src/features/*' },
        { type: 'entities', pattern: 'src/entities/*' },
        { type: 'shared', pattern: 'src/shared/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        2,
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['views', 'widgets', 'features', 'entities', 'shared'] },
            { from: 'views', allow: ['widgets', 'features', 'entities', 'shared'] },
            { from: 'widgets', allow: ['features', 'entities', 'shared'] },
            { from: 'features', allow: ['entities', 'shared'] },
            { from: 'entities', allow: ['shared'] },
            { from: 'shared', allow: ['shared'] },
          ],
        },
      ],
    },
  },
  {
    ignores: ['public/', 'dist/', 'node_modules/', '.svelte-kit/', 'static/'],
  },
);
```

- [ ] **Step 3: Add lint scripts**

In `package.json` scripts add:
```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

- [ ] **Step 4: Run lint and confirm it passes**

Run:
```bash
npm run lint
```
Expected: no errors. Fix any reported issues in the existing files (for example, unused vars).

- [ ] **Step 5: Prove the boundary rule actually fires**

Create a temporary violation: `src/shared/lib/boundary-probe.ts`:
```ts
// shared must not import from features. This import must be flagged.
import '$features/nothing';
```

Run:
```bash
npm run lint
```
Expected: ESLint reports a `boundaries/element-types` error for this file.

Then delete the probe:
```bash
rm src/shared/lib/boundary-probe.ts
```

Run lint again and confirm it is clean:
```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "chore: add ESLint flat config with FSD boundary enforcement"
```

---

## Task 6: dependency-cruiser CI gate

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json` (scripts, devDependencies)

- [ ] **Step 1: Install dependency-cruiser**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
npm install -D dependency-cruiser
```

- [ ] **Step 2: Write the config**

Create `.dependency-cruiser.cjs`:
```js
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make the graph impossible to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'layers-go-down-only',
      severity: 'error',
      comment: 'Lower FSD layers must not import higher ones.',
      from: { path: '^src/entities' },
      to: { path: '^src/(features|widgets|views|app)' },
    },
    {
      name: 'shared-imports-nothing-above',
      severity: 'error',
      comment: 'shared is the lowest layer and must not import any layer above it.',
      from: { path: '^src/shared' },
      to: { path: '^src/(entities|features|widgets|views|app)' },
    },
    {
      name: 'no-cross-feature-internals',
      severity: 'error',
      comment: 'A feature may import another feature only through its index public API.',
      from: { path: '^src/features/([^/]+)/.+' },
      to: {
        path: '^src/features/([^/]+)/.+',
        pathNot: ['^src/features/$1/.+', '^src/features/[^/]+/index\\.(ts|js)$'],
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|\\.spec\\.ts$)' },
  },
};
```

- [ ] **Step 3: Add the cruise script**

In `package.json` scripts add:
```json
{
  "scripts": {
    "cruise": "depcruise src --config .dependency-cruiser.cjs"
  }
}
```

- [ ] **Step 4: Run it and confirm clean**

Run:
```bash
npm run cruise
```
Expected: no violations (the only real module so far is `shared/lib`, which imports nothing above it).

- [ ] **Step 5: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "chore: add dependency-cruiser layer and cycle gate"
```

---

## Task 7: Prettier configuration

**Files:**
- Create: `.prettierrc`, `.prettierignore`
- Modify: `package.json` (scripts, devDependencies)

- [ ] **Step 1: Install Prettier and the Svelte plugin**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
npm install -D prettier prettier-plugin-svelte
```

- [ ] **Step 2: Write the Prettier config**

Create `.prettierrc`:
```json
{
  "useTabs": false,
  "tabWidth": 2,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

Create `.prettierignore`:
```
public/
dist/
node_modules/
static/
*.md
```

- [ ] **Step 3: Add format scripts**

In `package.json` scripts add:
```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 4: Format the codebase and confirm clean**

Run:
```bash
npm run format
npm run format:check
```
Expected: format writes files, then check passes with no issues.

- [ ] **Step 5: Re-run lint to confirm Prettier and ESLint agree**

Run:
```bash
npm run lint
```
Expected: no errors (eslint-config-prettier disables conflicting rules).

- [ ] **Step 6: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "chore: add Prettier with Svelte plugin"
```

---

## Task 8: Signal K webapp package.json manifest

The package must declare itself a Signal K webapp so the server lists and serves it. Per the spec and the integration guide: keywords `signalk-webapp` and `signalk-category-chart-plotters`, a `signalk` manifest with `appIcon`, `displayName`, and `screenshots`, and `files` shipping the built `public/` directory.

**Files:**
- Modify: `package.json`
- Create: `static/binnacle-icon.svg` (placeholder icon), referenced by `appIcon`

- [ ] **Step 1: Add a placeholder app icon**

Create `static/binnacle-icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="#06090d" />
  <circle cx="36" cy="36" r="22" fill="none" stroke="#4ea3ff" stroke-width="3" />
  <path d="M36 14 L36 58 M14 36 L58 36" stroke="#4ea3ff" stroke-width="2" />
  <polygon points="36,22 41,40 36,36 31,40" fill="#e7edf3" />
</svg>
```
(Vite copies `static/` to the build root, so this lands at `public/binnacle-icon.svg`.)

- [ ] **Step 2: Set the Signal K manifest fields in package.json**

Edit `package.json` so it includes these top-level fields (merge with the existing scaffold, keep the existing `scripts` and `devDependencies`):
```json
{
  "name": "binnacle",
  "version": "0.1.0",
  "description": "Next-generation marine chart plotter for Signal K",
  "type": "module",
  "license": "Apache-2.0",
  "author": "Nearl Crews <23341701+NearlCrews@users.noreply.github.com>",
  "keywords": ["signalk-webapp", "signalk-category-chart-plotters"],
  "engines": { "node": ">=22" },
  "signalk": {
    "appIcon": "./binnacle-icon.svg",
    "displayName": "Binnacle",
    "screenshots": []
  },
  "files": ["public/"]
}
```

- [ ] **Step 3: Verify the build still produces a servable public/ tree**

Run:
```bash
NODE_ENV=production npm run build
```
Expected: `public/index.html` and `public/binnacle-icon.svg` exist.

Confirm the icon copied:
```bash
test -f public/binnacle-icon.svg && echo "icon present"
```
Expected: prints "icon present".

- [ ] **Step 4: Verify the package would pack cleanly with only public/**

Run:
```bash
npm pack --dry-run
```
Expected: the listed tarball contents include `public/` files and `package.json`, and do not include `src/`.

- [ ] **Step 5: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "feat: declare Signal K webapp manifest and app icon"
```

---

## Task 9: Playwright end-to-end smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`
- Modify: `package.json` (scripts, devDependencies)

- [ ] **Step 1: Install Playwright**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
npm install -D @playwright/test
npx playwright install chromium
```
Expected: Playwright and the Chromium browser install.

- [ ] **Step 2: Write the Playwright config**

Create `playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Confirm the preview script serves at port 4173 with the prod base**

The webapp builds with base `/binnacle/`, so `vite preview` serves at `/binnacle/`. Set the preview script and Playwright base path accordingly. In `package.json` add:
```json
{
  "scripts": {
    "preview": "vite preview --port 4173",
    "test:e2e": "playwright test"
  }
}
```

Update `playwright.config.ts` `use.baseURL` to `http://localhost:4173/binnacle/` and the `webServer.url` to `http://localhost:4173/binnacle/`.

- [ ] **Step 4: Write the smoke test**

Create `e2e/smoke.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('app shell renders the brand and status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Binnacle')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();
});
```

- [ ] **Step 5: Build, then run the smoke test**

Run (one heavy step at a time):
```bash
NODE_ENV=production npm run build
```
Then:
```bash
npm run test:e2e
```
Expected: 1 passed. The webServer boots `vite preview`, the page loads at `/binnacle/`, and both texts are visible.

- [ ] **Step 6: Ignore Playwright artifacts**

Confirm `.gitignore` already lists `playwright-report/`, `test-results/`, and `playwright-results/` (it does from Phase 0). If `test-results/` is missing, add it.

- [ ] **Step 7: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "test: add Playwright e2e smoke test for the app shell"
```

---

## Task 10: CI gate (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm run cruise
      - run: npm test
      - run: npm run build
        env:
          NODE_ENV: production
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 2: Validate the workflow file parses**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!y.includes('npm run check')||!y.includes('npm run cruise')) throw new Error('CI missing gates'); console.log('CI gates present');"
```
Expected: prints "CI gates present".

- [ ] **Step 3: Commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "ci: add typecheck, lint, cruise, test, build, e2e gate"
```

---

## Task 11: Full local gate run (one heavy command at a time)

This mirrors CI locally before declaring the phase done. Per `CLAUDE.md`, never run two heavy commands at once on the Pi.

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
NODE_OPTIONS="--max-old-space-size=2048" npm run check
```
Expected: no errors.

- [ ] **Step 2: Lint**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run lint
```
Expected: no errors.

- [ ] **Step 3: Dependency cruise (light)**

Run:
```bash
npm run cruise
```
Expected: no violations.

- [ ] **Step 4: Unit tests**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm test
```
Expected: units tests pass.

- [ ] **Step 5: Production build**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build
```
Expected: clean build to `public/`.

- [ ] **Step 6: End-to-end smoke**

Run:
```bash
npm run test:e2e
```
Expected: 1 passed.

- [ ] **Step 7: Format check**

Run:
```bash
npm run format:check
```
Expected: no issues.

---

## Task 12: Cleanup gate and phase close

This phase is one "major step" under the build policy, so it ends with the `/cleanup` skill and a fix-everything-including-nit pass.

**Files:** as surfaced by cleanup.

- [ ] **Step 1: Run the cleanup skill**

Invoke the `/cleanup` skill against the Phase 1 diff (the whole tree so far). Brief any agents on the project style rules: American English, no em dashes, Oxford commas, default to no comments.

- [ ] **Step 2: Fix every finding**

Apply all cleanup findings including low and nit. The only acceptable skip is factually refuted or by-design after honest scrutiny, with a one-line reason recorded in the commit body.

- [ ] **Step 3: Re-run the full local gate**

Repeat Task 11 (each heavy command on its own) and confirm green after the cleanup edits.

- [ ] **Step 4: Final phase commit**

```bash
cd /home/dietpi/src/signalk-binnacle
git add -A
git commit -m "chore: Phase 1 project floor cleanup pass"
```

- [ ] **Step 5: Confirm the phase exit criteria**

Verify all of the following are true:
- `npm run check`, `npm run lint`, `npm run cruise`, `npm test`, `npm run build`, and `npm run test:e2e` all pass.
- The build emits to `public/` with base `/binnacle/`, and `npm pack --dry-run` ships `public/` but not `src/`.
- The FSD layers exist, path aliases resolve, and the boundary rules fire on a violation (proven in Task 5, Step 5).
- The `shared/lib` units module has passing tests and a public `index.ts`.
- `package.json` declares the Signal K webapp keywords and manifest.

When all are true, Phase 1 is complete and Phase 2 (the real-time data layer) can begin.

---

## Self-review notes

- **Spec coverage (Phase 1 portion):** the spec's build-order step 1 (project floor: Vite, Svelte 5, TypeScript, Vitest, Playwright, ESLint with boundary rules, dependency-cruiser, path aliases, the Signal K webapp package.json, and a CI gate) is fully covered by Tasks 1 through 12. The units module (spec section 6.5) is started here as the proving vertical; the rest of the data layer is Phase 2.
- **Out of scope for Phase 1 (correctly deferred):** the worker, Comlink, the store, MapLibre, charts, vessels, theming, and the offline pipeline. These are Phases 2 through 7.
- **Placeholder scan:** none. Every step has concrete commands and complete file contents.
- **Type and name consistency:** the alias names (`$app`, `$views`, `$widgets`, `$features`, `$entities`, `$shared`) are identical across `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, and `.dependency-cruiser.cjs`. The unit function names match between `units.ts`, `units.test.ts`, and `index.ts`.
- **Pi memory:** Task 11 and Task 12 run heavy commands one at a time with a memory cap, per `CLAUDE.md`.
