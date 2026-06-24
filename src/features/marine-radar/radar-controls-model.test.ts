import { describe, expect, it } from 'vitest';
import { widgetKind } from './radar-controls-model';

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
  it('does not treat an empty descriptions object as a list', () => {
    expect(widgetKind({ id: 'gain', name: 'Gain', dataType: 'number', descriptions: {} })).toBe(
      'slider',
    );
  });
  it('uses a button for a momentary action and a toggle for an enable flag', () => {
    expect(widgetKind({ id: 'transmit', name: 'Transmit', dataType: 'button' })).toBe('button');
    expect(widgetKind({ id: 'power', name: 'Power', dataType: 'boolean' })).toBe('toggle');
  });
});
