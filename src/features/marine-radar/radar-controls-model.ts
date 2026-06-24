import type { ControlDefinition } from './radar-types';

// Map a Signal K radar control definition to the widget that edits it: a boolean is a toggle, an enum is
// a select, and a number or compound control is a slider over its value.
export function widgetKind(def: ControlDefinition): 'slider' | 'list' | 'toggle' {
  if (def.type === 'boolean') return 'toggle';
  if (def.type === 'enum') return 'list';
  return 'slider';
}
