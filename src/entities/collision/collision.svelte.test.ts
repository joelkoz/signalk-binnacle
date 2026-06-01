import { describe, expect, it } from 'vitest';
import type { AisTargetView } from '$entities/ais';
import { DEFAULT_THRESHOLDS } from '$shared/settings';
import { assessContacts } from './collision.svelte';

const ownStationary = { position: { latitude: 0, longitude: 0 }, sogKnots: 0, cogDegrees: 0 };

function target(partial: Partial<AisTargetView>): AisTargetView {
  return { id: 't', position: { latitude: 0, longitude: 0 }, ...partial };
}

describe('assessContacts', () => {
  it('returns no dangers without an own position', () => {
    const r = assessContacts(undefined, [target({})], DEFAULT_THRESHOLDS);
    expect(r.contacts).toHaveLength(0);
    expect(r.worst).toBe('clear');
  });

  it('prefers the provider CPA/TCPA when present and flags the source', () => {
    const t = target({ id: 'p', cpaMeters: 100, tcpaSeconds: 120 });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts[0].source).toBe('provider');
    expect(r.contacts[0].severity).toBe('danger');
    expect(r.worst).toBe('danger');
  });

  it('drops a provider contact whose CPA is in the past (negative TCPA)', () => {
    // An opening or passed target reports a negative TCPA; a small CPA must not alarm.
    const t = target({ id: 'past', cpaMeters: 50, tcpaSeconds: -30 });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts).toHaveLength(0);
    expect(r.worst).toBe('clear');
  });

  it('computes CPA/TCPA when the provider value is absent and flags it computed', () => {
    // 1 nm due north closing south at about 10 kn: inside the danger or warning band.
    const t = target({
      id: 'c',
      position: { latitude: 1852 / 111320, longitude: 0 },
      sogKnots: 10,
      cogDegrees: 180,
    });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts[0].source).toBe('computed');
    expect(['danger', 'warning']).toContain(r.contacts[0].severity);
  });

  it('classifies a distant opening target as clear and drops it', () => {
    const t = target({
      id: 'o',
      position: { latitude: 0.2, longitude: 0 },
      sogKnots: 10,
      cogDegrees: 0,
    });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts.every((c) => c.severity !== 'clear')).toBe(true);
    expect(r.worst).toBe('clear');
  });

  it('ranks danger before warning', () => {
    const danger = target({ id: 'd', cpaMeters: 100, tcpaSeconds: 60 });
    const warn = target({ id: 'w', cpaMeters: 1500, tcpaSeconds: 900 });
    const r = assessContacts(ownStationary, [warn, danger], DEFAULT_THRESHOLDS);
    expect(r.contacts[0].id).toBe('d');
  });
});
