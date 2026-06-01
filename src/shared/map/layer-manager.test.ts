import { describe, expect, it } from 'vitest';
import { createFakeMap } from '$shared/testing/fake-map';
import { LayerManager } from './layer-manager';
import type { OverlayContext, OverlayModule } from './types';

function fakeCtx(): OverlayContext {
  return {
    map: createFakeMap() as never,
    beforeIdFor: () => undefined,
  };
}

function fakeOverlay(id: string): OverlayModule & { events: string[] } {
  const events: string[] = [];
  return {
    id,
    title: id,
    band: 'traffic',
    supportsOpacity: true,
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

  it('layers() returns a snapshot of registered overlays in order', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    expect(manager.layers().map((l) => l.id)).toEqual(['a', 'b']);
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
});
