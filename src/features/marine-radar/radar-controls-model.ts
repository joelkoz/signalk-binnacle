import type { ControlDefinition } from './radar-types';

const CONTROL_PATH = /^radars\.([^.]+)\.controls\.(.+)$/;

export function controlValueFromDelta(
  path: string,
  value: number,
): { radarId: string; controlId: string; value: number } | undefined {
  const match = CONTROL_PATH.exec(path);
  if (!match) return undefined;
  return { radarId: match[1], controlId: match[2], value };
}

export function widgetKind(def: ControlDefinition): 'slider' | 'list' | 'button' | 'toggle' {
  const type = (def.dataType ?? '').toLowerCase();
  if (type === 'button') return 'button';
  if (type === 'boolean') return 'toggle';
  if (def.validValues?.length || def.descriptions || type === 'list' || type === 'map')
    return 'list';
  return 'slider';
}
