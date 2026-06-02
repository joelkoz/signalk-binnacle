import { describe, expect, it } from 'vitest';
import { authInit, str, strArray } from './resource';

describe('authInit', () => {
  it('returns undefined with no token and no extra', () => {
    expect(authInit(undefined)).toBeUndefined();
  });

  it('sets the bearer header when a token is present', () => {
    expect(authInit('tok')).toEqual({ headers: { Authorization: 'Bearer tok' } });
  });

  it('merges extra init and headers alongside the token header', () => {
    expect(
      authInit('tok', { method: 'PUT', headers: { 'Content-Type': 'application/json' } }),
    ).toEqual({
      method: 'PUT',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    });
  });

  it('returns extra with no auth header when there is no token', () => {
    expect(authInit(undefined, { credentials: 'omit' })).toEqual({
      credentials: 'omit',
      headers: {},
    });
  });
});

describe('str', () => {
  it('keeps a non-empty string and rejects everything else', () => {
    expect(str('a')).toBe('a');
    expect(str('')).toBeUndefined();
    expect(str(5)).toBeUndefined();
    expect(str(undefined)).toBeUndefined();
  });
});

describe('strArray', () => {
  it('keeps the non-empty strings or returns undefined', () => {
    expect(strArray(['a', '', 'b', 1])).toEqual(['a', 'b']);
    expect(strArray([])).toBeUndefined();
    expect(strArray('x')).toBeUndefined();
  });
});
