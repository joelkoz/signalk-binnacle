# Binnacle Lookout, Step 2: The Danger Strip

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface collision danger on screen. A `DangerStrip` widget consumes the `CollisionAssessment` entity from step 1 and renders the ranked dangerous contacts with CPA and TCPA, color-graded by severity, with an acknowledge control and a "computing locally" affordance when the data is the client-side fallback. It mounts as a bottom overlay on the chart, present only when there is danger so the calm screen stays dark (the night-watch pillar). Implements build-order step 2 of `docs/superpowers/specs/2026-05-31-binnacle-lookout-design.md`.

**Architecture:** A reactivity fix in the `entities/collision` layer (the assessment must depend on `aisVersion` so a reactive consumer re-renders on AIS change), then a `features/lookout` slice with `DangerStrip.svelte`, wired into `App.svelte` as an absolutely-positioned overlay at the bottom of the chart host (not a grid row, to avoid the collapse the auth banner caused). Thresholds come from `createThresholds()` in `shared/settings`.

**Tech Stack:** Svelte 5 runes, TypeScript, the existing `CollisionAssessment`, `AisTargets`, `OwnVessel`, `createThresholds`, and the `metersToNauticalMiles` formatter. Theme tokens for color.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy command at a time on the Pi. Lead-driven, never commit or push on red (hooks enforce). Ends with `/cleanup` and the full gate, verified live.

---

## Module boundary note

- `src/entities/ais/ais-targets.svelte.ts`: add a `version` getter that reads `store.aisVersion`, so a consumer of `list()` can take a reactive dependency on AIS changes. `index.ts` unchanged (the getter is on the existing class).
- `src/entities/collision/collision.svelte.ts`: `assessment` reads `this.#targets.version` to establish the AIS dependency.
- `src/features/lookout/DangerStrip.svelte`, `index.ts`: the widget. New `features/lookout` slice; imports `$entities/collision` and `$shared/lib`.
- `src/app/App.svelte`: create the `CollisionAssessment` and render the strip in the chart host.

dependency-cruiser stays green.

---

## Task 1: Make the assessment reactive on AIS change

**Files:** modify `src/entities/ais/ais-targets.svelte.ts`, `src/entities/collision/collision.svelte.ts`.

- [ ] **Step 1:** Add a `version` getter to `AisTargets` (the class already holds `#store`):
```ts
  // Reading this in a reactive context takes a dependency on AIS changes, since the
  // store bumps aisVersion ($state) on every AIS update and prune.
  get version(): number {
    return this.#store.aisVersion;
  }
```

- [ ] **Step 2:** In `CollisionAssessment.assessment`, read the version before building the assessment so the getter is reactive on AIS change:
```ts
  get assessment(): Assessment {
    // Take a reactive dependency on AIS updates; list() iterates a non-reactive Map.
    void this.#targets.version;
    const position = this.#vessel.position;
    const own = position
      ? { position, sogKnots: this.#vessel.sogKnots ?? 0, cogDegrees: this.#vessel.cogDegrees ?? 0 }
      : undefined;
    return assessContacts(own, this.#targets.list(), this.#thresholds.value);
  }
```

- [ ] **Step 3:** `npm run check`, `npm run cruise`, green. Commit `fix(collision): make the assessment reactive on AIS updates`.

NOTE: this cannot be unit-tested for reactivity in this toolchain (runes are inert in Vitest, a known limitation), so it is verified live in Task 5. The value path is already covered by the step-1 tests.

---

## Task 2: The DangerStrip widget

**Files:** create `src/features/lookout/DangerStrip.svelte`, `src/features/lookout/index.ts`.

- [ ] **Step 1:** Create `DangerStrip.svelte`:
```svelte
<script lang="ts">
import type { CollisionAssessment } from '$entities/collision';
import { metersToNauticalMiles } from '$shared/lib';

interface Props {
  collision: CollisionAssessment;
}

const { collision }: Props = $props();

const MAX_ROWS = 4;

const contacts = $derived(collision.assessment.contacts);
const top = $derived(contacts.slice(0, MAX_ROWS));
const computedFallback = $derived(contacts.some((c) => c.source === 'computed'));

function nm(meters: number): string {
  return (metersToNauticalMiles(meters) ?? 0).toFixed(2);
}

function minutes(seconds: number): string {
  return (seconds / 60).toFixed(1);
}
</script>

{#if contacts.length > 0}
  <aside class="danger-strip" aria-label="Collision danger" aria-live="assertive">
    <div class="head">
      <span class="title">Danger</span>
      {#if computedFallback}
        <span class="note">computing locally</span>
      {/if}
      <button type="button" class="ack" onclick={() => collision.acknowledge()}>Acknowledge</button>
    </div>
    <ul class="list">
      {#each top as contact (contact.id)}
        <li class="row {contact.severity}">
          <span class="name">{contact.name || contact.id}</span>
          <span class="metric">CPA <b>{nm(contact.cpaMeters)}</b> nm</span>
          <span class="metric">TCPA <b>{minutes(contact.tcpaSeconds)}</b> min</span>
        </li>
      {/each}
    </ul>
  </aside>
{/if}

<style>
.danger-strip {
  inline-size: min(28rem, calc(100% - 1.5rem));
  padding: 0.5rem 0.75rem;
  background: var(--surface-overlay);
  border: 1px solid var(--alarm);
  border-radius: 0.5rem;
  color: var(--text);
  font-family: var(--font-ui);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-block-end: 0.4rem;
}
.title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--alarm);
}
.note {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.ack {
  margin-inline-start: auto;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.85rem;
}
.row.danger .name {
  color: var(--alarm);
  font-weight: 600;
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
</style>
```
NOTE: `metersToNauticalMiles` already exists in `$shared/lib`. The strip shows the top `MAX_ROWS` contacts; CPA in nautical miles, TCPA in minutes, the display-edge convention. `aria-live="assertive"` so a danger is announced. The acknowledge button calls the existing `acknowledge()`; the audible-alarm wiring that consumes `acknowledged` is step 4, not here.

- [ ] **Step 2:** Create `src/features/lookout/index.ts`:
```ts
export { default as DangerStrip } from './DangerStrip.svelte';
```

- [ ] **Step 3:** `npm run check`, `npm run cruise`, green. Commit `feat(lookout): danger strip widget`.

---

## Task 3: Wire it into the shell

**Files:** modify `src/app/App.svelte`.

- [ ] **Step 1:** Imports and construction. Add:
```ts
import { CollisionAssessment } from '$entities/collision';
import { AisTargets } from '$entities/ais';
import { DangerStrip } from '$features/lookout';
import { createThresholds } from '$shared/settings';
```
and after the existing `vessel`/`store` construction:
```ts
const aisTargets = new AisTargets(store);
const thresholds = createThresholds();
const collision = new CollisionAssessment(vessel, aisTargets, thresholds);
```
NOTE: `ChartCanvas` constructs its own `AisTargets(store)` internally for the AIS overlay; a second instance here is fine since both read the same store. No shared instance is required.

- [ ] **Step 2:** Render the strip as a bottom overlay inside the chart host, after the layers panel, so it floats at the bottom of the map and never affects the grid (the auth banner taught this lesson). Add inside `<section class="chart-host">`:
```svelte
    <div class="danger-slot">
      <DangerStrip {collision} />
    </div>
```
and style:
```css
.danger-slot {
  position: absolute;
  inset-block-end: 0.75rem;
  inset-inline: 0.75rem;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}
.danger-slot :global(.danger-strip) {
  pointer-events: auto;
}
```
NOTE: `pointer-events: none` on the slot lets map drags pass through the empty area, while the strip itself re-enables pointer events for the acknowledge button.

- [ ] **Step 3:** `npm run check`, `npm run cruise`, green. Commit `feat(lookout): mount the danger strip in the shell`.

---

## Task 4: Full local gate

Run each heavy command alone, capture to a file, read it back:
- [ ] `biome ci .`
- [ ] `npm run cruise`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm test`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`

All green.

---

## Task 5: Verify live, cleanup, doc gate

- [ ] **Step 1: Verify live.** Deploy and load. With AIS traffic present and the default thresholds, confirm: a closing target inside the bands shows a row in the strip with CPA (nm) and TCPA (min); the strip is absent when nothing is dangerous; panning the map does not dismiss it; the row updates as the target moves (the reactivity fix); the "computing locally" note appears when no CPA provider is installed (source is computed). If the boat has no dangerous traffic, inject a synthetic close target via a Signal K delta in a browser probe to confirm rendering, then remove it.
- [ ] **Step 2:** Run `/cleanup` on the diff, fix every finding including nit.
- [ ] **Step 3: Doc gate.** CHANGELOG entry (the danger strip). README "What is in place" note that collision danger is surfaced. Update `.remember` and the `project-status` memory (Lookout step 2 done; steps 3 to 6 remain).
- [ ] **Step 4:** Re-run the full gate, commit, and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** The strip renders the ranked dangerous contacts with CPA and TCPA, color-graded, with acknowledge and the computed-fallback note; it is absent when calm; it updates reactively as AIS changes; it never breaks the shell layout; dependency-cruiser is green; all gates pass.

When all are true, Lookout step 2 is complete. Step 3 (the collision chart-highlight overlay in the safety band) follows.

---

## Self-review notes

- **Spec coverage:** implements build-order step 2: the danger strip with CPA and TCPA, severity color, acknowledge, and the computed-fallback affordance, mounted in the shell, absent when calm. The audible alarm (step 4), notifications (step 5), and thresholds panel (step 6) are intentionally not here; the acknowledge button calls the existing flag the alarm step will consume.
- **Reactivity:** the assessment now reads `aisVersion` ($state) so the strip re-renders on AIS change, fixing the same lazy-reactive-read class of bug seen with the vessel readouts. Verified live, since runes are inert in this Vitest setup.
- **Layout safety:** the strip is an absolute overlay in the chart host, not a grid row, so it cannot collapse the chart (the auth-banner lesson).
- **Type and name consistency:** `CollisionAssessment`, `DangerContact`, `acknowledge`, `metersToNauticalMiles`, and `createThresholds` match the entity and the shared modules.
- **Verify before push:** every heavy command runs alone and is read from a file; the hooks enforce green; one heavy command at a time respects the Pi budget; verified live in the browser.
