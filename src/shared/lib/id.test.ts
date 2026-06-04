import { describe, expect, it } from 'vitest';
import { uuidv4 } from './id';

// The exact pattern the Signal K resources API enforces for standard resource ids (routes,
// waypoints). A non-UUID id is rejected with HTTP 400, so uuidv4 must always satisfy this.
const SK_UUID =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/;

describe('uuidv4', () => {
  it('produces a valid v4 UUID the Signal K resources API accepts', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(uuidv4()).toMatch(SK_UUID);
    }
  });

  it('returns distinct ids', () => {
    expect(uuidv4()).not.toBe(uuidv4());
  });

  it('still returns a valid UUID without crypto.randomUUID (a plain-http context)', () => {
    const had = Object.hasOwn(globalThis.crypto, 'randomUUID');
    const desc = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    // Simulate a non-secure context, where randomUUID is absent but getRandomValues is not.
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(uuidv4()).toMatch(SK_UUID);
    } finally {
      if (had && desc) Object.defineProperty(globalThis.crypto, 'randomUUID', desc);
      else delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
