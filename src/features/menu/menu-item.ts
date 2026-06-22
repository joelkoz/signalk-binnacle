import type { LucideIcon } from '@lucide/svelte';

// One entry in the app menu. The menu is generic: it renders whatever items it is given,
// so a new option is one more MenuItem in the list, never a change to the menu itself.
export interface MenuItem {
  id: string;
  label: string;
  // The compact label the bottom-bar pill renders when set, so a bar pill stays short ("Charts")
  // while the menu tile keeps the full descriptive label ("Layers and charts"). The menu always
  // renders `label`; the bar renders `shortLabel ?? label`.
  shortLabel?: string;
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
