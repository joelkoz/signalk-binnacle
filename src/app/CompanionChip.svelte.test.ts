import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { CompanionState } from '$features/prewarm';
import CompanionChip from './CompanionChip.svelte';

// Renders the chip to an SSR HTML string (the suite runs in the node environment, no DOM), enough to
// pin its presence, per-state text, and the warning-dot state.
function body(props: {
  present: boolean;
  state: CompanionState;
  cacheBytes: number | null;
}): string {
  return render(CompanionChip, { props }).body;
}

describe('CompanionChip', () => {
  it('renders nothing when the companion is not present', () => {
    const html = body({ present: false, state: 'serving', cacheBytes: 4096 });
    expect(html).not.toContain('Offline charts');
  });

  it('shows the byte figure only in serving', () => {
    const serving = body({ present: true, state: 'serving', cacheBytes: 4096 });
    expect(serving).toContain('Offline charts 4.0 KB');
    expect(serving).toContain('Chart Locker: cache 4.0 KB');
    expect(serving).not.toContain('sign in');
    expect(serving).not.toContain('no reply');

    expect(body({ present: true, state: 'needs-auth', cacheBytes: 4096 })).not.toContain('4.0 KB');
    expect(body({ present: true, state: 'down', cacheBytes: 4096 })).not.toContain('4.0 KB');
  });

  it('shows the distinct text for needs-auth and down', () => {
    expect(body({ present: true, state: 'needs-auth', cacheBytes: null })).toContain(
      'Offline charts: sign in',
    );
    expect(body({ present: true, state: 'down', cacheBytes: null })).toContain(
      'Offline charts: no reply',
    );
  });

  it('applies the warning dot only in the down state', () => {
    expect(body({ present: true, state: 'down', cacheBytes: null })).toContain(
      'companion-chip--down',
    );
    expect(body({ present: true, state: 'serving', cacheBytes: 4096 })).not.toContain(
      'companion-chip--down',
    );
    expect(body({ present: true, state: 'needs-auth', cacheBytes: null })).not.toContain(
      'companion-chip--down',
    );
  });
});
