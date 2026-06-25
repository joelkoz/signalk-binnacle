import { describe, expect, it } from 'vitest';
import { blockedReason, itemBlocked, type MenuItem } from './menu-item';

const noop = () => {};
const item = (extra: Partial<MenuItem> = {}): MenuItem => ({
  id: 'x',
  label: 'X',
  onSelect: noop,
  ...extra,
});

describe('itemBlocked', () => {
  it('is false for a plain interactive item', () => {
    expect(itemBlocked(item())).toBe(false);
    expect(itemBlocked(item({ available: true }))).toBe(false);
  });

  it('is true when transiently disabled', () => {
    expect(itemBlocked(item({ disabled: true }))).toBe(true);
  });

  it('is true when the provider is absent', () => {
    expect(itemBlocked(item({ available: false }))).toBe(true);
  });
});

describe('blockedReason', () => {
  it('is undefined for an interactive item', () => {
    expect(blockedReason(item())).toBeUndefined();
  });

  it('returns the unavailable hint when the provider is absent', () => {
    expect(blockedReason(item({ available: false, unavailableHint: 'Install mayara' }))).toBe(
      'Install mayara',
    );
  });

  it('returns the disabled reason when transiently disabled', () => {
    expect(blockedReason(item({ disabled: true, disabledLabel: 'Chart loading' }))).toBe(
      'Chart loading',
    );
  });

  it('prefers the provider-absent hint over the disabled reason when both apply', () => {
    expect(
      blockedReason(
        item({
          available: false,
          unavailableHint: 'Install mayara',
          disabled: true,
          disabledLabel: 'Chart loading',
        }),
      ),
    ).toBe('Install mayara');
  });

  it('is undefined when a state is set without its reason text', () => {
    expect(blockedReason(item({ available: false }))).toBeUndefined();
    expect(blockedReason(item({ disabled: true }))).toBeUndefined();
  });
});
