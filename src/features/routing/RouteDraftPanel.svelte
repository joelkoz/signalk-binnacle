<script lang="ts">
import { Save, Sparkles, X } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import type { Route } from '$entities/route';
import { InlineConfirm, promptSaveName } from '$shared/ui';
import { type DraftView, MAX_OPTIMIZE_WAYPOINTS } from './route-draft-client';

interface Props {
  // AI route drafting: shown only when the route-drafting plugin is detected.
  draftAvailable: boolean;
  // The route currently under edit on the chart, or undefined when not editing.
  working: Route | undefined;
  draftLoading: boolean;
  draftError: string | undefined;
  // The active AI draft as display strings (the caller formats the fuel line and orders the flags),
  // or undefined for a hand-drawn working route. Its presence is what makes the route a draft.
  draft: DraftView | undefined;
  // True when the current draft came from Optimize, so Cancel restores rather than discards.
  optimizeDraft: boolean;
  // True when the last optimize returned an unchanged route, so the panel shows a brief note.
  optimizeUnchanged: boolean;
  onDraft: (prompt: string) => void;
  // Called with the name the user enters; the panel prompts for it via the shared promptSaveName.
  onSave: (name: string) => void;
  // Optimize the drawn route via the same plugin. Shown while editing a hand-drawn route.
  onOptimize: (hint: string) => void;
  // Restore the pre-optimize drawing instead of clearing, used by Cancel during an optimize draft.
  onCancelDraft: () => void;
  onCancelEdit: () => void;
  // The route-under-edit working plan (stats, plan speed, legs) plus the add-waypoints hint, rendered
  // between the draft warnings and the save strip so the in-edit DOM order is unchanged.
  body: Snippet;
}

const {
  draftAvailable,
  working,
  draftLoading,
  draftError,
  draft,
  optimizeDraft,
  optimizeUnchanged,
  onDraft,
  onSave,
  onOptimize,
  onCancelDraft,
  onCancelEdit,
  body,
}: Props = $props();

function promptSave(): void {
  const name = promptSaveName('Route');
  if (name !== undefined) onSave(name);
}

// Draft input state: tracks whether the disclosure is open, the user's prompt text, and whether
// the save confirm is armed.
let draftOpen = $state(false);
let draftPrompt = $state('');
const trimmedPrompt = $derived(draftPrompt.trim());
let saveArmed = $state(false);

// Optimize hint: an opt-in one-liner so the action stays one-click. Collapsed by default.
let hintOpen = $state(false);
let optimizeHint = $state('');

// Draft save name: seeded from the draft's name when the working route first becomes a draft, but not
// overwritten while the user is typing. The prevWasDraft guard prevents the effect from fighting a user
// edit on subsequent renders.
let saveName = $state('');
let prevWasDraft = false;
$effect(() => {
  if (draft && !prevWasDraft) saveName = draft.name;
  prevWasDraft = draft !== undefined;
});
// When the caller clears the draft (after a save, cancel, or new route), collapse the disclosure and
// clear the local draft state so re-opening starts clean.
$effect(() => {
  if (draft === undefined) {
    draftOpen = false;
    draftPrompt = '';
    saveArmed = false;
    saveName = '';
    hintOpen = false;
    optimizeHint = '';
  }
});
</script>

{#if draftAvailable && working === undefined}
  <div class="draft-control">
    <button
      type="button"
      class="btn btn--grow"
      onclick={() => (draftOpen = !draftOpen)}
      aria-expanded={draftOpen}
    >
      Draft a route with AI
    </button>
    {#if draftOpen}
      <textarea
        class="input draft-prompt"
        placeholder="Describe your passage, e.g. 'from here to Avalon, stay 3 nm off the coast'"
        bind:value={draftPrompt}
        disabled={draftLoading}
        rows={3}
      ></textarea>
      {#if draftError}
        <p class="alert-note" role="alert">{draftError}</p>
      {/if}
      {#if draftLoading}
        <p class="muted-note">Drafting...</p>
      {/if}
      <div class="panel-controls">
        <button
          type="button"
          class="btn btn-primary btn--grow"
          disabled={draftLoading || trimmedPrompt === ''}
          onclick={() => {
            onDraft(trimmedPrompt);
          }}
        >
          Draft
        </button>
      </div>
    {/if}
  </div>
{/if}

{#if working}
  <div class="editing" role="group" aria-label="Route under edit">
    {#snippet saveStrip(onSaveClick: () => void, disabled: boolean)}
      <div class="panel-controls">
        <button type="button" class="btn btn-primary btn--grow" {disabled} onclick={onSaveClick}>
          <Save size={16} aria-hidden="true" />
          Save
        </button>
        <button
          type="button"
          class="btn"
          onclick={() => (optimizeDraft ? onCancelDraft() : onCancelEdit())}
        >
          <X size={16} aria-hidden="true" />
          Cancel
        </button>
      </div>
    {/snippet}
    {#if draft}
      <p class="alert-note" role="alert">
        {#if draft.source === 'optimize'}
          Not chart-verified. The AI moved your waypoints to find safer water.
        {:else}
          Not chart-verified.
        {/if}
        Check every leg against the chart and save only what you have verified. This AI draft is
        checked leg by leg against charted and modeled marine data that varies by region and does
        not cover depth everywhere. Read each flag below with its stated source and datum. It is
        advisory and online, it is not a substitute for the chart, and the absence of a flag is not
        proof of clear water.
      </p>
      {#if draft.confidence === 'low'}
        <p class="alert-note" role="alert">
          The model flagged this draft as low confidence. Scrutinize every leg with extra care.
        </p>
      {/if}
      {#if draft.destination}
        <p class="muted-note">Read as: {draft.destination}</p>
      {/if}
      {#if draft.note}
        <p class="muted-note">{draft.note}</p>
      {/if}
      {#if draft.fuel}
        <p class="muted-note">{draft.fuel}</p>
      {/if}
      {#if draft.flags && draft.flags.length > 0}
        <ul class="draft-flags">
          {#each draft.flags as flag (flag.message)}
            <li class="alert-note">
              {flag.message}
              {#if flag.detail}
                <ul class="draft-hazards">
                  {#each flag.detail as hazard (hazard)}
                    <li>{hazard}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    {#if draftAvailable && draft === undefined}
      {@const waypointCount = working.waypoints.length}
      {@const tooMany = waypointCount > MAX_OPTIMIZE_WAYPOINTS}
      <div class="optimize">
        <button
          type="button"
          class="btn btn--grow"
          onclick={() => onOptimize(optimizeHint.trim())}
          disabled={draftLoading || waypointCount < 2 || tooMany}
          aria-label="Optimize this route with AI"
        >
          <Sparkles size={16} aria-hidden="true" />
          Optimize route
        </button>
        <button
          type="button"
          class="btn"
          onclick={() => (hintOpen = !hintOpen)}
          aria-expanded={hintOpen}
          aria-controls="optimize-constraint-input"
          disabled={draftLoading}
        >
          Add a constraint
        </button>
      </div>
      {#if hintOpen}
        <input
          id="optimize-constraint-input"
          class="input"
          type="text"
          bind:value={optimizeHint}
          placeholder="stay 3 nm off"
          aria-label="Optimize constraint"
        >
      {/if}
      {#if tooMany}
        <p class="muted-note">
          Simplify the route to optimize it: the limit is {MAX_OPTIMIZE_WAYPOINTS} waypoints.
        </p>
      {/if}
      {#if draftLoading}
        <p class="muted-note">Optimizing...</p>
      {/if}
      {#if optimizeUnchanged}
        <p class="muted-note">No safer or shorter route found. Your route is unchanged.</p>
      {/if}
    {/if}
    {@render body()}
    {#if draft}
      <div class="draft-save">
        <input
          type="text"
          class="input"
          aria-label="Route name"
          placeholder="Route name"
          bind:value={saveName}
        >
        {#if saveArmed}
          <InlineConfirm
            question="I checked every leg. Save this route?"
            onConfirm={() => {
              saveArmed = false;
              onSave(saveName.trim() || draft.name);
            }}
            onCancel={() => (saveArmed = false)}
          />
        {:else}
          {@render saveStrip(() => (saveArmed = true), working.waypoints.length < 2)}
        {/if}
      </div>
    {:else}
      {@render saveStrip(promptSave, working.waypoints.length < 2)}
    {/if}
  </div>
{/if}

<style>
.editing {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.6rem;
  border: 1px solid var(--accent);
  border-inline-start-width: 3px;
  border-radius: var(--radius-sm);
  background: var(--accent-tint);
  box-shadow: var(--shadow-overlay);
}
.draft-control {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.5rem 0;
}
/* The optimize action and its constraint toggle sit on one row above the working-plan stats. */
.optimize {
  display: flex;
  gap: 0.4rem;
}
/* The box, border, and type come from the global .input utility; only the textarea-specific resize,
   block padding (.input is a single-line control with inline padding only), and disabled dimming are
   scoped here. */
.draft-prompt {
  resize: vertical;
  padding-block: var(--space-2);
}
.draft-prompt:disabled {
  opacity: 0.6;
}
/* The flags list inherits the .alert-note appearance per item; no border on the list itself. */
.draft-flags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
/* The per-leg hazard breakdown under a grouped hazard summary: a compact, muted, indented list. */
.draft-hazards {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
  list-style: disc;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.draft-save {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
</style>
