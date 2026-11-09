// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { applyTheme, useTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    useTheme.setState({ theme: 'system' });
  });

  it('applies dark theme attribute to documentElement', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applies light theme attribute to documentElement', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes data-theme attribute on system theme', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('updates state via setTheme', () => {
    useTheme.getState().setTheme('dark');
    expect(useTheme.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
