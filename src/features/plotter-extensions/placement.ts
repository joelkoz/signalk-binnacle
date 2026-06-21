import type { PlotterExtHost, WidgetPlacement } from '$entities/plotter-ext';
import type { PlotterExtension, WidgetContribution } from '$shared/signalk';
import { sizeToSpan, WIDGET_AREAS } from './util';

// Layout model duplicated from Freeboard-SK's plotter-ext
// (plotterext.service.ts + widget-overlay.component.ts), adapted to Binnacle's area ids:
//
//  - Per-area grids: corners are 4 wide (up to eight 1x1, or four 2x1), centers stay 2 wide;
//    every area is 2 rows (widgets are never taller than the gravity stack).
//  - Vertical GRAVITY: widgets pack from the area's screen edge inward. Top areas fill row 0
//    first, bottom areas fill the last row first. The gravity row fills before the other row.
//  - Horizontal FILL toward the screen corner first: right-anchored areas fill right-to-left,
//    the rest left-to-right. So the first widget lands in the corner (or, for a center area,
//    is centered as a unit via the overlay's half-cell shift).
//  - No floating: a single-row widget off the gravity row needs the cells between it and the
//    gravity edge occupied.
//
// Unit tested without a DOM.

// Fixed cell footprint (the overlay renders the same --pe-cell), so a chart-pixel press maps to
// the same anchor area the overlay draws. These mirror values across a JS/CSS boundary with no
// shared source, so keep them in sync with WidgetOverlay: CELL_PX is the --pe-cell fallback (88px)
// and GAP_PX is --space-1 (0.25rem at the 16px root).
const CELL_PX = 88;
const GAP_PX = 4;

export const AREA_GRID: Record<string, { cols: number; rows: number }> = {
  'top-center': { cols: 2, rows: 2 },
  'top-right': { cols: 4, rows: 2 },
  'bottom-left': { cols: 4, rows: 2 },
  'bottom-center': { cols: 2, rows: 2 },
  'bottom-right': { cols: 4, rows: 2 },
};

const GRAVITY: Record<string, 'top' | 'bottom'> = {
  'top-center': 'top',
  'top-right': 'top',
  'bottom-left': 'bottom',
  'bottom-center': 'bottom',
  'bottom-right': 'bottom',
};

const COL_FILL: Record<string, 'left' | 'right'> = {
  'top-center': 'left',
  'top-right': 'right',
  'bottom-left': 'left',
  'bottom-center': 'left',
  'bottom-right': 'right',
};

const CENTER_AREAS = new Set(['top-center', 'bottom-center']);

export function isCenterArea(area: string): boolean {
  return CENTER_AREAS.has(area);
}

interface Origin {
  col: number;
  row: number;
}

function gravityRow(area: string): number {
  return GRAVITY[area] === 'bottom' ? AREA_GRID[area].rows - 1 : 0;
}

function colOrder(area: string): number[] {
  const cols = Array.from({ length: AREA_GRID[area].cols }, (_, i) => i);
  return COL_FILL[area] === 'right' ? cols.reverse() : cols;
}

function occupancy(placements: readonly WidgetPlacement[], area: string): boolean[][] {
  const { cols, rows } = AREA_GRID[area];
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  for (const p of placements) {
    if (p.area !== area) continue;
    const [pc, pr] = sizeToSpan(p.size);
    for (let r = p.cell[1]; r < p.cell[1] + pr && r < rows; r++) {
      for (let c = p.cell[0]; c < p.cell[0] + pc && c < cols; c++) grid[r][c] = true;
    }
  }
  return grid;
}

function isValidOrigin(
  area: string,
  span: [number, number],
  origin: Origin,
  occupied: boolean[][],
): boolean {
  const { cols, rows } = AREA_GRID[area];
  const [sc, sr] = span;
  if (origin.col + sc > cols || origin.row + sr > rows) return false;
  for (let r = origin.row; r < origin.row + sr; r++) {
    for (let c = origin.col; c < origin.col + sc; c++) {
      if (occupied[r][c]) return false;
    }
  }
  // No floating: a single-row widget away from the gravity row needs support toward that edge.
  if (sr === 1) {
    const gr = gravityRow(area);
    if (origin.row !== gr) {
      for (let c = origin.col; c < origin.col + sc; c++) {
        if (!occupied[gr][c]) return false;
      }
    }
  }
  return true;
}

function originOrder(area: string): Origin[] {
  const { rows } = AREA_GRID[area];
  const asc = Array.from({ length: rows }, (_, i) => i);
  const rowOrder = GRAVITY[area] === 'bottom' ? [...asc].reverse() : asc;
  const cols = colOrder(area);
  const order: Origin[] = [];
  for (const row of rowOrder) {
    for (const col of cols) order.push({ col, row });
  }
  return order;
}

// The best origin for a widget of the given size in an area (gravity- and corner-first), or null
// when it does not fit anywhere valid.
export function findOrigin(
  placements: readonly WidgetPlacement[],
  area: string,
  size: WidgetContribution['size'],
  precomputed?: boolean[][],
): [number, number] | null {
  const occupied = precomputed ?? occupancy(placements, area);
  const span = sizeToSpan(size);
  for (const origin of originOrder(area)) {
    if (isValidOrigin(area, span, origin, occupied)) return [origin.col, origin.row];
  }
  return null;
}

// The grid columns a center area's placed widgets occupy, so the overlay can shift a lone widget
// to dead-center (mirrors Freeboard's --pe-center-shift).
export function usedColumns(placements: readonly WidgetPlacement[], area: string): Set<number> {
  const used = new Set<number>();
  for (const p of placements) {
    if (p.area !== area) continue;
    const [pc] = sizeToSpan(p.size);
    for (let c = p.cell[0]; c < p.cell[0] + pc && c < AREA_GRID[area].cols; c++) used.add(c);
  }
  return used;
}

export interface AddCandidate {
  extensionId: string;
  extensionName: string;
  widget: WidgetContribution;
  origin: [number, number];
}

// The widgets that can still be placed in an area (those with a valid origin).
export function candidateWidgets(
  extensions: readonly PlotterExtension[],
  placements: readonly WidgetPlacement[],
  area: string,
): AddCandidate[] {
  const out: AddCandidate[] = [];
  const occupied = occupancy(placements, area);
  for (const ext of extensions) {
    for (const widget of ext.widgets) {
      const origin = findOrigin(placements, area, widget.size, occupied);
      if (origin) {
        out.push({ extensionId: ext.id, extensionName: ext.name, widget, origin });
      }
    }
  }
  return out;
}

function areaSize(area: string): { w: number; h: number } {
  const { cols, rows } = AREA_GRID[area];
  return { w: cols * CELL_PX + (cols - 1) * GAP_PX, h: rows * CELL_PX + (rows - 1) * GAP_PX };
}

function areaRect(
  area: string,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  const { w, h } = areaSize(area);
  const centerX = width / 2 - w / 2;
  switch (area) {
    case 'top-center':
      return { x: centerX, y: 0, w, h };
    case 'top-right':
      return { x: width - w, y: 0, w, h };
    case 'bottom-left':
      return { x: 0, y: height - h, w, h };
    case 'bottom-center':
      return { x: centerX, y: height - h, w, h };
    case 'bottom-right':
      return { x: width - w, y: height - h, w, h };
    default:
      return null;
  }
}

// The anchor area whose on-screen rect contains a chart-pixel point, or null when the point is not
// over any area (so the context menu offers no "Add widget" item there).
export function areaAt(x: number, y: number, width: number, height: number): string | null {
  for (const area of WIDGET_AREAS) {
    const r = areaRect(area.id, width, height);
    if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return area.id;
  }
  return null;
}

// The chart context-menu resolver: if a chart-pixel press lands in an anchor area that can still
// take a widget, returns an action that opens the add-widget picker for that area; otherwise
// undefined, so the menu omits the "Add widget" item.
export function addWidgetActionAt(
  host: PlotterExtHost,
  x: number,
  y: number,
  width: number,
  height: number,
): (() => void) | undefined {
  const area = areaAt(x, y, width, height);
  if (!area) return undefined;
  if (candidateWidgets(host.extensions, host.placements, area).length === 0) return undefined;
  return () => host.openPicker(area);
}
