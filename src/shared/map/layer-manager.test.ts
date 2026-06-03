import { describe, expect, it } from 'vitest';
import { createFakeMap } from '$shared/testing/fake-map';
import { LayerManager } from './layer-manager';
import type { OverlayContext, OverlayModule, ZBand } from './types';

function fakeCtx(): OverlayContext {
  return {
    map: createFakeMap() as never,
    beforeIdFor: () => undefined,
  };
}

function fakeOverlay(id: string, band: ZBand = 'traffic'): OverlayModule & { events: string[] } {
  const events: string[] = [];
  return {
    id,
    title: id,
    band,
    supportsOpacity: true,
    layerIds: [`${id}-layer`],
    events,
    add: () => {
      events.push('add');
    },
    remove: () => {
      events.push('remove');
    },
    setVisible: (_ctx, visible) => {
      events.push(`visible:${visible}`);
    },
    setOpacity: (_ctx, opacity) => {
      events.push(`opacity:${opacity}`);
    },
  };
}

describe('LayerManager', () => {
  it('adds an overlay on register and applies default state', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    expect(overlay.events).toContain('add');
    expect(overlay.events).toContain('visible:true');
    expect(overlay.events).toContain('opacity:1');
  });

  it('toggle drives setVisible', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.toggle('ais', false);
    expect(overlay.events.at(-1)).toBe('visible:false');
  });

  it('setOpacity drives setOpacity', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.setOpacity('ais', 0.4);
    expect(overlay.events.at(-1)).toBe('opacity:0.4');
  });

  it('unregister removes the overlay', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.unregister('ais');
    expect(overlay.events.at(-1)).toBe('remove');
  });

  it('rejects a duplicate id', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('ais'));
    await expect(manager.register(fakeOverlay('ais'))).rejects.toThrow();
  });

  it('reattachAll re-adds and restores state', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.setOpacity('ais', 0.5);
    overlay.events.length = 0;
    await manager.reattachAll();
    expect(overlay.events).toContain('add');
    expect(overlay.events).toContain('opacity:0.5');
  });

  it('layers() returns overlays top of the map first', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    // Same band, so b (registered later) sits above a; layers() lists the top layer first.
    expect(manager.layers().map((l) => l.id)).toEqual(['b', 'a']);
    expect(manager.layers()[0]).toMatchObject({ visible: true, opacity: 1 });
  });

  it('restores saved visibility and opacity on register', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx(), {
      saved: { ais: { visible: false, opacity: 0.3 } },
    });
    await manager.register(overlay);
    expect(overlay.events).toContain('visible:false');
    expect(overlay.events).toContain('opacity:0.3');
  });

  it('a layer with no saved entry takes the visible default', async () => {
    const overlay = fakeOverlay('charts');
    const manager = new LayerManager(fakeCtx(), { saved: { ais: { visible: false, opacity: 1 } } });
    await manager.register(overlay);
    expect(overlay.events).toContain('visible:true');
  });

  it('reports the full settings snapshot on toggle and opacity changes', async () => {
    const changes: Array<Record<string, { visible: boolean; opacity: number }>> = [];
    const manager = new LayerManager(fakeCtx(), { onChange: (s) => changes.push(s) });
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    manager.toggle('a', false);
    manager.setOpacity('b', 0.5);
    expect(changes.at(-1)).toEqual({
      a: { visible: false, opacity: 1 },
      b: { visible: true, opacity: 0.5 },
    });
  });

  it('orders overlays by band by default, top of the map first', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('chart', 'basemap'));
    await manager.register(fakeOverlay('vessel', 'vessel'));
    await manager.register(fakeOverlay('track', 'track'));
    expect(manager.layers().map((l) => l.id)).toEqual(['vessel', 'track', 'chart']);
  });

  it('reorder moves a non-pinned layer and persists the new bottom-to-top order', async () => {
    const orders: string[][] = [];
    const manager = new LayerManager(fakeCtx(), { onOrderChange: (o) => orders.push(o) });
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    await manager.register(fakeOverlay('c'));
    // Display order top to bottom starts [c, b, a]; move 'a' to the top.
    manager.reorder('a', 0);
    expect(manager.layers().map((l) => l.id)).toEqual(['a', 'c', 'b']);
    expect(orders.at(-1)).toEqual(['b', 'c', 'a']);
  });

  it('restores a saved order on register', async () => {
    const manager = new LayerManager(fakeCtx(), { savedOrder: ['b', 'c', 'a'] });
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    await manager.register(fakeOverlay('c'));
    // Saved bottom-to-top [b, c, a] reads top to bottom as [a, c, b].
    expect(manager.layers().map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });

  it('applies a module defaultOpacity when there is no saved state', async () => {
    const overlay = { ...fakeOverlay('field'), defaultOpacity: 0.6 };
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    expect(overlay.events).toContain('opacity:0.6');
  });

  it('hides other members of an exclusive group when one is enabled', async () => {
    const manager = new LayerManager(fakeCtx(), { exclusive: [['a', 'b']] });
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    manager.toggle('a', true);
    manager.toggle('b', true);
    const items = manager.layers();
    expect(items.find((i) => i.id === 'a')?.visible).toBe(false);
    expect(items.find((i) => i.id === 'b')?.visible).toBe(true);
  });

  it('keeps pinned overlays on top and immovable', async () => {
    const manager = new LayerManager(fakeCtx(), { pinned: ['vessel'] });
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('vessel', 'vessel'));
    expect(manager.layers()[0]).toMatchObject({ id: 'vessel', pinned: true });
    manager.reorder('a', 0);
    expect(manager.layers()[0].id).toBe('vessel');
  });
});
