import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { AnchorWatch } from '$entities/anchor';
import type { UnitsStore } from '$entities/units';
import type { OwnVessel } from '$entities/vessel';
import type { MenuItem } from '$features/menu';
import type { CompanionState } from '$features/prewarm';
import type { ConnectionPhase } from '$shared/signalk';
import StatusStrip from './StatusStrip.svelte';

// Renders the strip to an SSR HTML string (the suite runs in the node environment, no DOM), enough to
// pin the offline-charts chip presence, per-state text, and the warning-dot state.
function body(over: {
  companionPresent: boolean;
  companionState: CompanionState;
  companionCacheBytes: number | null;
}): string {
  return render(StatusStrip, {
    props: {
      connectionLabel: 'Connected',
      streamError: false,
      online: true,
      fixStale: false,
      connectionPhase: 'closed' as ConnectionPhase,
      aisCount: 0,
      anchor: { watching: false } as unknown as AnchorWatch,
      units: { mode: 'metric' } as unknown as UnitsStore,
      vessel: { sogMps: null, cogRad: null } as unknown as OwnVessel,
      mapView: undefined,
      pinnedActions: [] as MenuItem[],
      ...over,
    },
  }).body;
}

describe('StatusStrip offline-charts chip', () => {
  it('is absent when the companion is not present', () => {
    const html = body({
      companionPresent: false,
      companionState: 'serving',
      companionCacheBytes: 4096,
    });
    expect(html).not.toContain('Offline charts');
  });

  it('shows the byte figure only in serving', () => {
    const serving = body({
      companionPresent: true,
      companionState: 'serving',
      companionCacheBytes: 4096,
    });
    expect(serving).toContain('Offline charts 4.0 KB');
    expect(serving).toContain('Chart Locker: cache 4.0 KB');
    expect(serving).not.toContain('sign in');
    expect(serving).not.toContain('no reply');

    const needsAuth = body({
      companionPresent: true,
      companionState: 'needs-auth',
      companionCacheBytes: 4096,
    });
    expect(needsAuth).not.toContain('4.0 KB');

    const down = body({
      companionPresent: true,
      companionState: 'down',
      companionCacheBytes: 4096,
    });
    expect(down).not.toContain('4.0 KB');
  });

  it('shows the distinct text for needs-auth and down', () => {
    expect(
      body({ companionPresent: true, companionState: 'needs-auth', companionCacheBytes: null }),
    ).toContain('Offline charts: sign in');
    expect(
      body({ companionPresent: true, companionState: 'down', companionCacheBytes: null }),
    ).toContain('Offline charts: no reply');
  });

  it('uses the warning dot only in the down state', () => {
    expect(
      body({ companionPresent: true, companionState: 'down', companionCacheBytes: null }),
    ).toContain('companion-chip--down');
    expect(
      body({ companionPresent: true, companionState: 'serving', companionCacheBytes: 4096 }),
    ).not.toContain('companion-chip--down');
    expect(
      body({ companionPresent: true, companionState: 'needs-auth', companionCacheBytes: null }),
    ).not.toContain('companion-chip--down');
  });
});
