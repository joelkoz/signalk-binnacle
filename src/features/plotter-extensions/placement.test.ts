import { describe, expect, it } from 'vitest';
import type { WidgetPlacement } from '$entities/plotter-ext';
import type { PlotterExtension, WidgetSize } from '$shared/signalk';
import { areaAt, candidateWidgets, findOrigin, usedColumns } from './placement';

const W = 1400;
const H = 900;

function placement(
  area: string,
  cell: [number, number],
  size: WidgetSize = '1x1',
): WidgetPlacement {
  return {
    instanceId: `${area}-${cell.join('')}`,
    extensionId: 'ext',
    widgetId: 'w',
    area,
    cell,
    size,
  };
}

function ext(widgets: Array<{ id: string; size: WidgetSize }>): PlotterExtension {
  return {
    id: 'ext',
    name: 'Ext',
    apiVersion: '1',
    requires: [],
    optional: [],
    widgets: widgets.map((w) => ({
      id: w.id,
      title: w.id,
      type: 'iframe',
      url: `/${w.id}`,
      size: w.size,
    })),
    panels: [],
    buttons: [],
    background: [],
  };
}

describe('findOrigin packs from the anchor corner inward', () => {
  it('puts the first widget in the screen corner of a corner area', () => {
    // top-right (4x2, top gravity, fill right) -> rightmost column, top row.
    expect(findOrigin([], 'top-right', '1x1')).toEqual([3, 0]);
    // bottom-left (4x2, bottom gravity, fill left) -> leftmost column, bottom row.
    expect(findOrigin([], 'bottom-left', '1x1')).toEqual([0, 1]);
    // bottom-right (4x2, bottom gravity, fill right) -> rightmost column, bottom row.
    expect(findOrigin([], 'bottom-right', '1x1')).toEqual([3, 1]);
  });

  it('puts the first center widget at column 0 of the gravity row (centered via the overlay shift)', () => {
    expect(findOrigin([], 'top-center', '1x1')).toEqual([0, 0]);
    expect(findOrigin([], 'bottom-center', '1x1')).toEqual([0, 1]);
  });

  it('fills the gravity row toward the corner before stacking into the other row', () => {
    const tr = [placement('top-right', [3, 0])];
    expect(findOrigin(tr, 'top-right', '1x1')).toEqual([2, 0]);
    // Fill the whole top row, then the next 1x1 stacks below the corner (no floating).
    const fullTop = [0, 1, 2, 3].map((c) => placement('top-right', [c, 0]));
    expect(findOrigin(fullTop, 'top-right', '1x1')).toEqual([3, 1]);
  });

  it('rejects a widget that cannot fit and respects the no-float rule', () => {
    // A 2x2 fits a fresh corner (4x2) but not once a corner cell is taken in a blocking way.
    expect(findOrigin([], 'top-right', '2x2')).toEqual([2, 0]);
    // A lone 1x1 may not float in the non-gravity row of an empty area.
    // (covered indirectly: first origin is always the gravity row.)
    const center = [placement('top-center', [0, 0]), placement('top-center', [1, 0])];
    expect(findOrigin(center, 'top-center', '2x1')).toEqual([0, 1]);
  });
});

describe('usedColumns (center recentering)', () => {
  it('reports the occupied columns of a center area', () => {
    expect([...usedColumns([placement('top-center', [0, 0])], 'top-center')]).toEqual([0]);
    expect([...usedColumns([placement('top-center', [0, 0], '2x1')], 'top-center')].sort()).toEqual(
      [0, 1],
    );
  });
});

describe('candidateWidgets', () => {
  it('offers only widgets that still fit the area', () => {
    const extensions = [
      ext([
        { id: 'small', size: '1x1' },
        { id: 'big', size: '2x2' },
      ]),
    ];
    // Fill the top-center area (2x2) completely.
    const placements = [
      placement('top-center', [0, 0]),
      placement('top-center', [1, 0]),
      placement('top-center', [0, 1]),
      placement('top-center', [1, 1]),
    ];
    expect(candidateWidgets(extensions, placements, 'top-center')).toHaveLength(0);
    expect(candidateWidgets(extensions, [], 'top-center').map((c) => c.widget.id)).toEqual([
      'small',
      'big',
    ]);
  });
});

describe('areaAt', () => {
  it('maps corner and edge points to their (now wider) anchor areas, center to none', () => {
    expect(areaAt(W - 30, 30, W, H)).toBe('top-right');
    expect(areaAt(30, H - 30, W, H)).toBe('bottom-left');
    expect(areaAt(W - 30, H - 30, W, H)).toBe('bottom-right');
    expect(areaAt(W / 2, 30, W, H)).toBe('top-center');
    expect(areaAt(W / 2, H / 2, W, H)).toBeNull();
  });
});

describe('findOrigin capacity', () => {
  it('returns null when every cell of the area is occupied', () => {
    // top-right is a 4-by-2 grid; fill all eight cells.
    const full = [0, 1, 2, 3].flatMap((c) => [
      placement('top-right', [c, 0]),
      placement('top-right', [c, 1]),
    ]);
    expect(findOrigin(full, 'top-right', '1x1')).toBeNull();
  });

  it('returns null for a 2x2 when no two adjacent columns are free in the same rows', () => {
    // Occupy one cell in each column so no 2-by-2 block remains free.
    const scattered = [
      placement('top-right', [0, 0]),
      placement('top-right', [1, 1]),
      placement('top-right', [2, 0]),
      placement('top-right', [3, 1]),
    ];
    expect(findOrigin(scattered, 'top-right', '2x2')).toBeNull();
  });
});
