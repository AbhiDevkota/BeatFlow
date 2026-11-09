import { useEffect, useState } from 'react';
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

/** Whether the active resolved theme is dark (honouring system preferences when on 'system'). */
export function useIsDark(): boolean {
  const theme = useTheme((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return systemDark;
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

