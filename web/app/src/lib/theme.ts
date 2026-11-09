import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'dark' | 'light';

export const useTheme = create<{
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    {
      name: 'beatflow:theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

// Initial application on file evaluation
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('beatflow:theme');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.theme) applyTheme(parsed.state.theme);
    }
  } catch {
    // Ignore parse errors
  }
}
