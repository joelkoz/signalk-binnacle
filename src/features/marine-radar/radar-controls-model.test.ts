import { describe, expect, it } from 'vitest';
import { widgetKind } from './radar-controls-model';
import type { ControlDefinition } from './radar-types';

describe('widgetKind', () => {
  it('returns "toggle" for a boolean control', () => {
    const def: ControlDefinition = { id: 'power', name: 'Power', type: 'boolean' };
    expect(widgetKind(def)).toBe('toggle');
  });

  it('returns "list" for an enum control', () => {
    const def: ControlDefinition = {
      id: 'mode',
      name: 'Mode',
      type: 'enum',
      values: [
        { value: 0, label: 'Off' },
        { value: 1, label: 'Bird' },
        { value: 2, label: 'Harbor' },
      ],
    };
    expect(widgetKind(def)).toBe('list');
  });

  it('returns "slider" for a number control', () => {
    const def: ControlDefinition = {
      id: 'gain',
      name: 'Gain',
      type: 'number',
      range: { min: 0, max: 100 },
    };
    expect(widgetKind(def)).toBe('slider');
  });

  it('returns "slider" for a compound control', () => {
    const def: ControlDefinition = {
      id: 'sea',
      name: 'Sea Clutter',
      type: 'compound',
      range: { min: 0, max: 100 },
      modes: ['auto', 'manual'],
    };
    expect(widgetKind(def)).toBe('slider');
  });

  it('returns "slider" for a number control with no range specified', () => {
    const def: ControlDefinition = { id: 'rain', name: 'Rain Clutter', type: 'number' };
    expect(widgetKind(def)).toBe('slider');
  });

  it('returns "toggle" for a read-only boolean flag', () => {
    const def: ControlDefinition = {
      id: 'transmit',
      name: 'Transmitting',
      type: 'boolean',
      readOnly: true,
    };
    expect(widgetKind(def)).toBe('toggle');
  });
});
