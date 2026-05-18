import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'globeride.theme';
const META_THEME_COLOR = { dark: '#0b1220', light: '#f8fafc' } as const;

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage may be unavailable (private mode, etc.) — default below.
  }
  return 'dark';
}

function applyThemeToDocument(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_THEME_COLOR[theme]);
}

interface ThemeStoreState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  theme: readInitialTheme(),
  setTheme: (t) => {
    applyThemeToDocument(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Persistence failed — preference still applies for this session.
    }
    set({ theme: t });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

// Ensure document state matches the initial store value as soon as the module
// loads — index.html runs an inline bootstrap script for the same reason to
// avoid a theme flash on first paint.
applyThemeToDocument(readInitialTheme());
