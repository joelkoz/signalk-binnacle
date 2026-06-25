import type { ControlDefinition } from './radar-types';

// Map a Signal K radar control definition to the widget that edits it: a boolean is a toggle, an enum is
// a select, and a number or compound control is a slider over its value.
export function widgetKind(def: ControlDefinition): 'slider' | 'list' | 'toggle' {
  if (def.type === 'boolean') return 'toggle';
  if (def.type === 'enum') return 'list';
  return 'slider';
}

// The everyday controls a helmsman reaches for underway, shown in their own section above the advanced
// rest. Data-driven: a radar that reports none of these collapses to a single Controls section, so the
// split never invents an empty group.
const PRIMARY_CONTROL_IDS: ReadonlySet<string> = new Set(['gain', 'sea', 'rain', 'range']);

export function isPrimaryControl(def: ControlDefinition): boolean {
  return PRIMARY_CONTROL_IDS.has(def.id);
}
