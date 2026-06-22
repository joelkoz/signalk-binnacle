<script lang="ts">
import type { PlotterExtHost, WidgetPlacement } from '$entities/plotter-ext';
import { dialog, focusTrap } from '$shared/ui';
import ExtIframe from './ExtIframe.svelte';
import { AREA_GRID, candidateWidgets, isCenterArea, usedColumns } from './placement';
import { HOST_INFO, resolveExtUrl, sizeToSpan, WIDGET_AREAS } from './util';

// Renders placed widgets in their anchor areas and the add-widget picker. There is no host chrome
// and no host-side press handling: a widget is added through the chart context menu ("Add widget",
// wired in App via addWidgetActionAt), which opens this picker for the chosen area; a placed widget
// is configured and removed through its own config panel (it detects its long-press and calls
// ui.openConfigPanel, since a sandboxed iframe captures its own pointer events).

interface Props {
  host: PlotterExtHost;
  origin: string;
}

const { host, origin }: Props = $props();

const pickerOptions = $derived(
  host.picker ? candidateWidgets(host.extensions, host.placements, host.picker.area) : [],
);

function placementsIn(area: string): WidgetPlacement[] {
  return host.placements.filter((p) => p.area === area);
}

// The widget iframe URL per placement, keyed by instance id and memoized so a re-render (for example
// opening or closing the picker) does not re-resolve and re-construct URL objects for every placed
// widget; it recomputes only when the placements change.
const widgetUrls = $derived(
  new Map(
    host.placements.map((p) => {
      const def = host.widgetDef(p.extensionId, p.widgetId);
      return [p.instanceId, def ? resolveExtUrl(origin, def.url) : undefined] as const;
    }),
  ),
);

function cellStyle(cell: [number, number], size: WidgetPlacement['size']): string {
  const [cols, rows] = sizeToSpan(size);
  return `grid-column: ${cell[0] + 1} / span ${cols}; grid-row: ${cell[1] + 1} / span ${rows};`;
}

// Per-area grid width (corners are wider than centers), plus the half-cell shift that recenters a
// lone widget in a center area.
function computeAreaStyle(area: string): string {
  let style = `grid-template-columns: repeat(${AREA_GRID[area].cols}, var(--pe-cell, 88px));`;
  if (isCenterArea(area)) {
    const used = usedColumns(host.placements, area);
    let shift = '0px';
    if (used.size === 1) {
      shift = used.has(0)
        ? 'calc((var(--pe-cell, 88px) + var(--space-1)) / 2)'
        : 'calc((var(--pe-cell, 88px) + var(--space-1)) / -2)';
    }
    style += ` --pe-center-shift: ${shift};`;
  }
  return style;
}

// Memoized per area so the per-area column scan runs once per placements change, not once per area
// on every render.
const areaStyles = $derived(
  new Map(WIDGET_AREAS.map((a) => [a.id, computeAreaStyle(a.id)] as const)),
);

function place(option: (typeof pickerOptions)[number]): void {
  const area = host.picker?.area;
  if (!area) return;
  host.closePicker();
  const placement = host.placeWidget(option.extensionId, option.widget.id, area, option.origin);
  // Open the config only when the widget has one; a no-config widget needs no dialog on add.
  if (placement && option.widget.configPanel) {
    host.openConfig(option.extensionId, placement.instanceId, option.widget.id);
  }
}
</script>

<div class="pe-overlay">
  {#each WIDGET_AREAS as area (area.id)}
    {@const placed = placementsIn(area.id)}
    {#if placed.length > 0}
      <div
        class="pe-area"
        data-area={area.id}
        role="group"
        aria-label={area.label}
        style={areaStyles.get(area.id)}
      >
        {#each placed as placement (placement.instanceId)}
          {@const url = widgetUrls.get(placement.instanceId)}
          <div class="pe-widget" style={cellStyle(placement.cell, placement.size)}>
            {#if url}
              {#key placement.instanceId}
                <ExtIframe
                  {host}
                  hostInfo={HOST_INFO}
                  kind="widget"
                  extensionId={placement.extensionId}
                  id={placement.widgetId}
                  instanceId={placement.instanceId}
                  src={url}
                  title={placement.widgetId}
                />
              {/key}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/each}
</div>

{#if host.picker}
  <div class="modal-scrim">
    <div
      class="modal-card pe-picker"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a widget"
      tabindex="-1"
      use:dialog={() => host.closePicker()}
      use:focusTrap
    >
      <header><h2>Add a widget</h2></header>
      {#if pickerOptions.length === 0}
        <p class="pe-empty">No widget fits here.</p>
      {:else}
        <ul>
          {#each pickerOptions as option (`${option.extensionId}/${option.widget.id}`)}
            <li>
              <button type="button" class="btn pe-option" onclick={() => place(option)}>
                <span class="pe-option-title">{option.widget.title}</span>
                <span class="pe-option-sub"
                  >{option.extensionName}
                  &middot; {option.widget.size}</span
                >
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <footer>
        <button type="button" class="btn" onclick={() => host.closePicker()}>Cancel</button>
      </footer>
    </div>
  </div>
{/if}

<style>
.pe-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay);
  pointer-events: none;
}
.pe-area {
  position: absolute;
  display: grid;
  /* grid-template-columns is set per area inline (corners are wider than centers). */
  grid-template-rows: repeat(2, var(--pe-cell, 88px));
  gap: var(--space-1);
}
/* Anchor areas sit flush to the map-area edges (corners touch both edges, center areas touch the
   top or bottom edge), matching the Freeboard convention. The map area is the chart host, which
   excludes Binnacle's bottom status-strip footer, so a bottom-flush widget rests on the map's
   bottom edge above that footer. Top-left is reserved for Binnacle chrome and is not an area. */
.pe-area[data-area="top-center"] {
  inset-block-start: 0;
  inset-inline-start: 50%;
  transform: translateX(calc(-50% + var(--pe-center-shift, 0px)));
}
.pe-area[data-area="top-right"] {
  inset-block-start: 0;
  inset-inline-end: 0;
}
.pe-area[data-area="bottom-left"] {
  inset-block-end: 0;
  inset-inline-start: 0;
}
.pe-area[data-area="bottom-center"] {
  inset-block-end: 0;
  inset-inline-start: 50%;
  transform: translateX(calc(-50% + var(--pe-center-shift, 0px)));
}
.pe-area[data-area="bottom-right"] {
  inset-block-end: 0;
  inset-inline-end: 0;
}
.pe-widget {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  box-shadow: var(--shadow-overlay);
}
.pe-picker {
  inline-size: min(22rem, calc(100dvw - 2 * var(--space-4)));
  max-block-size: 80dvh;
  overflow: auto;
  padding: var(--space-4);
}
.pe-picker h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
}
.pe-picker ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.pe-option {
  inline-size: 100%;
  display: grid;
  gap: 2px;
  text-align: start;
}
.pe-option-title {
  font-weight: 600;
}
.pe-option-sub {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.pe-empty {
  color: var(--text-muted);
}
.pe-picker footer {
  margin-block-start: var(--space-3);
  display: flex;
  justify-content: flex-end;
}
</style>
