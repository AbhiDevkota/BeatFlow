import { useEffect } from 'react';
import type { ArtworkColor } from './artworkColor';

export function isDarkHex(color: string): boolean {
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum < 128;
  }
  return false;
}

export function resolveSafeAccent(dark: boolean, accent?: string | null): string | null {
  if (!accent) return null;
  // Never allow a dark accent to turn text black on a dark tinted page (e.g. red playlists)
  if (dark && isDarkHex(accent)) return '#ffffff';
  return accent;
}

/**
 * Tints the whole scrolling page with the artwork's colour while a detail
 * page is open, as Apple's album and playlist pages do (report §3,
 * `has-theme-override`). The text colours that sit on it are switched in
 * tokens.css by `data-tint`.
 */
export function usePageTint(color: ArtworkColor | null) {
  useEffect(() => {
    const page = document.getElementById('scrollable-page');
    if (!page || !color) return;
    page.style.setProperty('--page-tint', color.background);
    const safeAccent = resolveSafeAccent(color.dark, color.accent);
    if (safeAccent) page.style.setProperty('--page-accent', safeAccent);
    if (color.keyColor) page.style.setProperty('--page-key', color.keyColor);
    if (color.secondary) page.style.setProperty('--page-secondary', color.secondary);
    if (color.elevated) page.style.setProperty('--page-elevated', color.elevated);
    if (color.divider) page.style.setProperty('--page-divider', color.divider);
    page.dataset.tint = color.dark ? 'dark' : 'light';
    return () => {
      page.style.removeProperty('--page-tint');
      page.style.removeProperty('--page-accent');
      page.style.removeProperty('--page-key');
      page.style.removeProperty('--page-secondary');
      page.style.removeProperty('--page-elevated');
      page.style.removeProperty('--page-divider');
      delete page.dataset.tint;
    };
  }, [color]);
}
