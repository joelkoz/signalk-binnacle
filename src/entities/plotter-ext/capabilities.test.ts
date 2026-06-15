import { describe, expect, it } from 'vitest';
import type { PlotterExtension } from '$shared/signalk';
import { isOfferable, offerableExtensions, pruneExtension } from './capabilities';

function manifest(overrides: Partial<PlotterExtension> = {}): PlotterExtension {
  return {
    id: 'ext',
    name: 'Ext',
    apiVersion: '1',
    requires: [],
    optional: [],
    widgets: [],
    panels: [],
    buttons: [],
    background: [],
    ...overrides,
  };
}

describe('isOfferable', () => {
  it('offers a v1 manifest whose requires are all supported', () => {
    expect(isOfferable(manifest({ requires: ['widgets', 'signalk.stream'] }))).toBe(true);
  });

  it('refuses a manifest requiring an unknown capability', () => {
    expect(isOfferable(manifest({ requires: ['widgets', 'x-other.thing'] }))).toBe(false);
  });

  it('refuses a manifest targeting a newer api version', () => {
    expect(isOfferable(manifest({ apiVersion: '2' }))).toBe(false);
  });

  it('refuses a manifest with a non-numeric api version', () => {
    expect(isOfferable(manifest({ apiVersion: 'next' }))).toBe(false);
  });

  it('honors a restricted capability set', () => {
    expect(isOfferable(manifest({ requires: ['map'] }), ['widgets'])).toBe(false);
    expect(isOfferable(manifest({ requires: ['widgets'] }), ['widgets'])).toBe(true);
  });
});

describe('pruneExtension', () => {
  it('drops contributions targeting a newer host api but keeps the rest', () => {
    const pruned = pruneExtension(
      manifest({
        widgets: [
          { id: 'a', title: 'A', type: 'iframe', url: '/a', size: '1x1' },
          { id: 'b', title: 'B', type: 'iframe', url: '/b', size: '1x1', apiVersion: '2' },
        ],
      }),
    );
    expect(pruned.widgets.map((w) => w.id)).toEqual(['a']);
  });
});

describe('offerableExtensions', () => {
  it('filters incompatible manifests and prunes contributions', () => {
    const out = offerableExtensions([
      manifest({ id: 'keep', requires: ['widgets'] }),
      manifest({ id: 'newer', apiVersion: '9' }),
      manifest({ id: 'unmet', requires: ['nope'] }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['keep']);
  });
});
