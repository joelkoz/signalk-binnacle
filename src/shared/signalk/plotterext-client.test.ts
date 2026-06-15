import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPlotterExtensions } from './plotterext-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fullManifest = {
  name: 'Instrument Widgets',
  description: 'Single-value instrument widgets.',
  version: '0.2.0',
  apiVersion: '1',
  requires: ['widgets', 'panels.iframe', 'signalk.stream'],
  optional: ['signalk.put', 'units'],
  widgets: [
    {
      id: 'gauge',
      title: 'Gauge',
      type: 'iframe',
      url: '/plotterext/signalk-instrument-widgets/gauge.html',
      size: '1x1',
      configPanel: 'instrument-config',
      lifecycle: 'whileEnabled',
    },
  ],
  panels: [
    {
      id: 'instrument-config',
      title: 'Instrument Setup',
      type: 'iframe',
      url: '/plotterext/signalk-instrument-widgets/config.html',
      lifecycle: 'onOpen',
    },
  ],
  buttons: [
    {
      id: 'refresh',
      title: 'Refresh',
      slot: 'mapToolbar',
      icon: 'refresh',
      action: { type: 'sendMessage', topic: 'iw:refresh' },
    },
  ],
  background: [
    {
      id: 'svc',
      type: 'iframe',
      url: '/plotterext/signalk-instrument-widgets/runtime.html',
    },
  ],
};

describe('fetchPlotterExtensions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a full manifest keyed by extension id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { 'signalk-instrument-widgets': fullManifest })),
    );
    const list = (await fetchPlotterExtensions('http://pi', 'tok')) ?? [];
    expect(list).toHaveLength(1);
    const ext = list[0];
    expect(ext.id).toBe('signalk-instrument-widgets');
    expect(ext.apiVersion).toBe('1');
    expect(ext.requires).toContain('widgets');
    expect(ext.widgets[0]).toMatchObject({
      id: 'gauge',
      size: '1x1',
      configPanel: 'instrument-config',
    });
    expect(ext.panels[0].id).toBe('instrument-config');
    expect(ext.buttons[0].action).toEqual({ type: 'sendMessage', topic: 'iw:refresh' });
    expect(ext.background[0]).toMatchObject({ id: 'svc', type: 'iframe' });
  });

  it('drops a manifest missing name or apiVersion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          noname: { apiVersion: '1' },
          noversion: { name: 'X' },
          ok: { name: 'X', apiVersion: '1' },
        }),
      ),
    );
    const list = (await fetchPlotterExtensions('http://pi')) ?? [];
    expect(list.map((e) => e.id)).toEqual(['ok']);
  });

  it('drops invalid contributions individually but keeps the manifest and valid ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          ext: {
            name: 'X',
            apiVersion: '1',
            widgets: [
              { id: 'good', title: 'Good', type: 'iframe', url: '/a.html', size: '2x2' },
              { id: 'badsize', title: 'Bad', type: 'iframe', url: '/b.html', size: '3x3' },
              { id: 'notiframe', title: 'Bad', type: 'div', url: '/c.html', size: '1x1' },
            ],
            buttons: [
              {
                id: 'b1',
                title: 'B1',
                slot: 'mapToolbar',
                action: { type: 'openPanel', panel: 'p' },
              },
              { id: 'b2', title: 'B2', slot: 'mapToolbar', action: { type: 'bogus' } },
            ],
          },
        }),
      ),
    );
    const list = (await fetchPlotterExtensions('http://pi')) ?? [];
    expect(list[0].widgets.map((w) => w.id)).toEqual(['good']);
    expect(list[0].buttons.map((b) => b.id)).toEqual(['b1']);
  });

  it('returns [] for a reachable empty server and undefined for a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));
    expect(await fetchPlotterExtensions('http://pi')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { message: 'no' })));
    expect(await fetchPlotterExtensions('http://pi')).toBeUndefined();
  });
});
