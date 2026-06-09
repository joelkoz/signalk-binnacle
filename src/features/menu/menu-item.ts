import type { LucideIcon } from '@lucide/svelte';

// One entry in the app menu. The menu is generic: it renders whatever items it is given,
// so a new option is one more MenuItem in the list, never a change to the menu itself.
export interface MenuItem {
  id: string;
  label: string;
  // Optional leading icon (a lucide-svelte component).
  icon?: LucideIcon;
  disabled?: boolean;
  // For a toggle (mute alarm, mute arrival), the current on state. When set, the menu renders it as a
  // role=menuitemcheckbox with aria-checked and an accent on-state; when undefined, the item is a plain
  // action and carries no checked semantics.
  pressed?: boolean;
  // Optional section heading. Consecutive items sharing a group render under one caps-label header,
  // so the menu groups itself from data without the menu component knowing the sections.
  group?: string;
  onSelect: () => void;
}
