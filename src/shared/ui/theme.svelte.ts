export const THEMES = ['day', 'dusk', 'night-red'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'binnacle:theme';

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export class ThemeController {
  theme = $state<Theme>('day');

  #apply: (theme: Theme) => void;
  #persist: (theme: Theme) => void;

  constructor(
    initial: string | null,
    apply: (theme: Theme) => void,
    persist: (theme: Theme) => void = () => {},
  ) {
    this.#apply = apply;
    this.#persist = persist;
    if (isTheme(initial)) this.theme = initial;
    this.#apply(this.theme);
  }

  set(theme: Theme): void {
    this.theme = theme;
    this.#apply(theme);
    this.#persist(theme);
  }

  cycle(): void {
    const next = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
    this.set(next);
  }
}

// Wires a ThemeController to the document and localStorage for app use.
export function createThemeController(onApply?: (theme: Theme) => void): ThemeController {
  const initial = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return new ThemeController(
    initial,
    (theme) => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = theme;
      }
      onApply?.(theme);
    },
    (theme) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
    },
  );
}
