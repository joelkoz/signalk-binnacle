import { describe, expect, it } from 'vitest';
import { controlValueFromDelta, widgetKind } from './radar-controls-model';

describe('controlValueFromDelta', () => {
  it('parses a radar control delta path', () => {
    expect(controlValueFromDelta('radars.nav1034A.controls.gain', 50)).toEqual({
      radarId: 'nav1034A',
      controlId: 'gain',
      value: 50,
    });
  });
  it('ignores non-radar-control paths', () => {
    expect(controlValueFromDelta('navigation.speedOverGround', 3)).toBeUndefined();
  });
});

describe('widgetKind', () => {
  it('uses a slider for a numeric range control', () => {
    expect(
      widgetKind({ id: 'gain', name: 'Gain', dataType: 'number', minValue: 0, maxValue: 100 }),
    ).toBe('slider');
  });
  it('uses a list when validValues or descriptions are present', () => {
    expect(
      widgetKind({
        id: 'mode',
        name: 'Mode',
        dataType: 'list',
        descriptions: { '0': 'Off', '1': 'Bird' },
      }),
    ).toBe('list');
  });
  it('uses a button for a momentary action and a toggle for an enable flag', () => {
    expect(widgetKind({ id: 'transmit', name: 'Transmit', dataType: 'button' })).toBe('button');
    expect(widgetKind({ id: 'power', name: 'Power', dataType: 'boolean' })).toBe('toggle');
  });
});
