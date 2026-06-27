import { describe, expect, it } from 'vitest';
import { isPowerControl, isPrimaryControl, widgetKind } from './radar-controls-model';
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

describe('isPowerControl and isPrimaryControl', () => {
  it('identifies the power and status controls so they leave the generic lists', () => {
    expect(isPowerControl({ id: 'power', name: 'Power', type: 'enum' })).toBe(true);
    expect(isPowerControl({ id: 'status', name: 'Status', type: 'enum' })).toBe(true);
    expect(isPowerControl({ id: 'gain', name: 'Gain', type: 'number' })).toBe(false);
  });

  it('treats gain, sea, rain, and range as primary controls', () => {
    for (const id of ['gain', 'sea', 'rain', 'range']) {
      expect(isPrimaryControl({ id, name: id, type: 'number' })).toBe(true);
    }
    expect(isPrimaryControl({ id: 'doppler', name: 'Doppler', type: 'enum' })).toBe(false);
  });
});
