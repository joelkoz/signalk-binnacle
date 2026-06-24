import type { ControlDefinition } from './radar-types';

export function widgetKind(def: ControlDefinition): 'slider' | 'list' | 'button' | 'toggle' {
  const dataKind = (def.dataType ?? '').toLowerCase();
  if (dataKind === 'button') return 'button';
  if (dataKind === 'boolean') return 'toggle';
  const hasOptions =
    (def.validValues?.length ?? 0) > 0 || Object.keys(def.descriptions ?? {}).length > 0;
  if (hasOptions || dataKind === 'list' || dataKind === 'map') return 'list';
  return 'slider';
}
