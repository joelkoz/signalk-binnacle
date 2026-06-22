import type { LucideIcon } from '@lucide/svelte';

// One entry in the app menu. The menu is generic: it renders whatever items it is given,
// so a new option is one more MenuItem in the list, never a change to the menu itself.
export interface MenuItem {
  id: string;
  label: string;
  // The compact label a bottom-bar pill renders when set, so a pill stays short ("Charts") while the
  // full descriptive label is kept elsewhere. The menu tiles and the bar's "More" overflow render
  // the full `label`; only the bar's visible pills render `shortLabel ?? label`.
  shortLabel?: string;
  // The tooltip a bottom-bar pill shows while the action is disabled, when the reason differs from the
  // label (for example "Layers and charts (chart is loading)"). Falls back to the label when unset.
  disabledLabel?: string;
  // Optional leading icon (a lucide-svelte component).
  icon?: LucideIcon;
  disabled?: boolean;
  // For a toggle surface (Measure armed, Forecast open), the current on state. When set, the
  // launcher renders the tile with aria-pressed and the accent on-state; when undefined, the item
  // is a plain action and carries no pressed semantics.
  pressed?: boolean;
  // Optional section heading. Consecutive items sharing a group render under one caps-label header,
  // so the menu groups itself from data without the menu component knowing the sections.
  group?: string;
  onSelect: () => void;
}
