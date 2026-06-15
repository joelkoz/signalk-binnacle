import { describe, expect, it, vi } from 'vitest';
import { PersistedValue } from '$shared/settings';
import type { PlotterExtension } from '$shared/signalk';
import type { ExtContext, HostAdapters, SignalKValue } from './adapters';
import { type ExtMethodHandler, type HostBusConnection, PlotterExtHost } from './host.svelte';

function manifest(overrides: Partial<PlotterExtension> = {}): PlotterExtension {
  return {
    id: 'ext',
    name: 'Ext',
    apiVersion: '1',
    requires: [],
    optional: [],
    widgets: [
      {
        id: 'gauge',
        title: 'Gauge',
        type: 'iframe',
        url: '/g.html',
        size: '1x1',
        configPanel: 'cfg',
      },
    ],
    panels: [{ id: 'cfg', title: 'Config', type: 'iframe', url: '/c.html' }],
    buttons: [],
    background: [],
    ...overrides,
  };
}

function fakeStorage(map = new Map<string, string>()): Pick<Storage, 'getItem' | 'setItem'> {
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function makeHost(readings: Record<string, SignalKValue> = {}) {
  const adapters: HostAdapters = {
    map: {
      getView: () => ({ center: [1, 2], zoom: 10, bounds: [0, 0, 3, 3] }),
      center: vi.fn(),
      fitBounds: vi.fn(),
    },
    signalk: {
      ensurePaths: vi.fn(),
      read: (path) => readings[path],
      put: vi.fn().mockResolvedValue({ state: 'COMPLETED' }),
    },
    resources: { list: vi.fn().mockResolvedValue({ a: {} }) },
    units: () => ({
      speed: 'kn',
      distance: 'naut-mile',
      depth: 'm',
      length: 'm',
      temperature: 'C',
    }),
  };
  const host = new PlotterExtHost(adapters, {
    placements: new PersistedValue('layout', [], fakeStorage()),
  });
  return { host, adapters };
}

function widgetCtx(extensionId: string, id: string, instanceId: string): ExtContext {
  return { kind: 'widget', extensionId, id, instanceId, targetInstance: null, targetWidget: null };
}

function fakeConn(): HostBusConnection & { publish: ReturnType<typeof vi.fn> } {
  return { publish: vi.fn(() => true) };
}

function call(handlers: Record<string, ExtMethodHandler>, name: string, params?: unknown) {
  return handlers[name](params);
}

describe('PlotterExtHost lifecycle', () => {
  it('places and removes widgets, persisting the layout', () => {
    const { host } = makeHost();
    host.load([manifest()]);
    const placement = host.placeWidget('ext', 'gauge', 'top-right', [0, 0]);
    expect(placement?.size).toBe('1x1');
    expect(host.placements).toHaveLength(1);
    host.removePlacement(placement?.instanceId ?? '');
    expect(host.placements).toHaveLength(0);
  });

  it('drops placements and closes UI for a departed extension on load', () => {
    const { host } = makeHost();
    host.load([manifest()]);
    host.placeWidget('ext', 'gauge', 'top-right', [0, 0]);
    host.openPanelById('ext', 'cfg');
    host.load([]);
    expect(host.placements).toHaveLength(0);
    expect(host.openPanel).toBeNull();
  });
});

describe('PlotterExtHost host API', () => {
  it('round-trips instance state and publishes state.changed to the extension', () => {
    const { host } = makeHost();
    host.load([manifest()]);
    const ctx = widgetCtx('ext', 'gauge', 'i1');
    const handlers = host.handlersFor(ctx);
    const conn = fakeConn();
    host.register(conn, ctx);
    call(handlers, 'state.set', { values: { path: 'navigation.speedOverGround' } });
    expect(call(handlers, 'state.get', {})).toEqual({
      values: { path: 'navigation.speedOverGround' },
    });
    expect(conn.publish).toHaveBeenCalledWith('state.changed', {
      scope: 'instance',
      instanceId: 'i1',
      keys: ['path'],
    });
  });

  it('relays subscribed Signal K values once per change', () => {
    const readings: Record<string, SignalKValue> = {
      'navigation.speedOverGround': { value: 3.1, timestamp: 't1' },
    };
    const { host } = makeHost(readings);
    const ctx = widgetCtx('ext', 'gauge', 'i1');
    const handlers = host.handlersFor(ctx);
    const conn = fakeConn();
    host.register(conn, ctx);
    call(handlers, 'signalk.subscribe', { paths: ['navigation.speedOverGround'] });
    host.pumpSignalK();
    host.pumpSignalK();
    expect(conn.publish).toHaveBeenCalledTimes(1);
    expect(conn.publish).toHaveBeenCalledWith('sk.navigation.speedOverGround', {
      path: 'navigation.speedOverGround',
      value: 3.1,
      timestamp: 't1',
      $source: undefined,
    });
    readings['navigation.speedOverGround'] = { value: 4.0, timestamp: 't2' };
    host.pumpSignalK();
    expect(conn.publish).toHaveBeenCalledTimes(2);
  });

  it('exposes units and map view, and forwards put and resource queries', async () => {
    const { host, adapters } = makeHost();
    const ctx = widgetCtx('ext', 'gauge', 'i1');
    const handlers = host.handlersFor(ctx);
    expect(call(handlers, 'units.get')).toEqual({
      units: { speed: 'kn', distance: 'naut-mile', depth: 'm', length: 'm', temperature: 'C' },
    });
    expect(call(handlers, 'map.getView')).toEqual({
      center: [1, 2],
      zoom: 10,
      bounds: [0, 0, 3, 3],
    });
    call(handlers, 'map.center', { position: [5, 6], zoom: 12 });
    expect(adapters.map.center).toHaveBeenCalledWith([5, 6], 12);
    await call(handlers, 'signalk.put', { path: 'a.b', value: 1 });
    expect(adapters.signalk.put).toHaveBeenCalledWith('a.b', 1);
    await call(handlers, 'resources.list', { type: 'notes' });
    expect(adapters.resources.list).toHaveBeenCalledWith('notes', undefined);
  });

  it('applies a display filter and publishes filters.changed to the extension', () => {
    const { host } = makeHost();
    host.load([manifest()]);
    const ctx = widgetCtx('ext', 'gauge', 'i1');
    const handlers = host.handlersFor(ctx);
    const conn = fakeConn();
    host.register(conn, ctx);
    call(handlers, 'resources.setFilter', {
      type: 'notes',
      filter: {
        mode: 'include',
        match: [{ path: 'properties.skIcon', op: 'eq', value: 'anchorage' }],
      },
    });
    expect(conn.publish).toHaveBeenCalledWith('filters.changed', { type: 'notes', active: true });
    expect(host.filters.passes('notes', 'a', { properties: { skIcon: 'anchorage' } })).toBe(true);
    expect(host.filters.passes('notes', 'b', { properties: { skIcon: 'marina' } })).toBe(false);
  });

  it('opens the config dialog from a widget ui.openConfigPanel call', () => {
    const { host } = makeHost();
    host.load([manifest()]);
    const ctx = widgetCtx('ext', 'gauge', 'i1');
    call(host.handlersFor(ctx), 'ui.openConfigPanel');
    expect(host.configDialog).toMatchObject({
      extensionId: 'ext',
      panelId: 'cfg',
      targetInstance: 'i1',
      targetWidget: 'gauge',
    });
  });

  it('dispatches a sendMessage button to every live context', () => {
    const { host } = makeHost();
    const ctx = widgetCtx('ext', 'gauge', 'i1');
    const conn = fakeConn();
    host.register(conn, ctx);
    host.dispatchButton('ext', { type: 'sendMessage', topic: 'ext:refresh', params: { n: 1 } });
    expect(conn.publish).toHaveBeenCalledWith('ext:refresh', { n: 1 });
  });
});
