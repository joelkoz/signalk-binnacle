import type { Component } from 'svelte';

// One entry in the app menu. The menu is generic: it renders whatever items it is given,
// so a new option is one more MenuItem in the list, never a change to the menu itself.
export interface MenuItem {
  id: string;
  label: string;
  // Optional leading icon (a lucide-svelte component).
  icon?: Component;
  disabled?: boolean;
  onSelect: () => void;
}
