import { describe, expect, it } from 'vitest';
import { isDarkHex, resolveSafeAccent } from './usePageTint';

describe('usePageTint safe accent resolution', () => {
  it('detects dark hex colors accurately', () => {
    expect(isDarkHex('#000000')).toBe(true);
    expect(isDarkHex('#1f1f1f')).toBe(true);
    expect(isDarkHex('#2b050b')).toBe(true);
    expect(isDarkHex('#ffffff')).toBe(false);
    expect(isDarkHex('#f5f5f7')).toBe(false);
  });

  it('normalizes dark or black accents to white on dark tinted pages', () => {
    expect(resolveSafeAccent(true, '#000000')).toBe('#ffffff');
    expect(resolveSafeAccent(true, '#2b050b')).toBe('#ffffff');
    expect(resolveSafeAccent(true, '#ffffff')).toBe('#ffffff');
    expect(resolveSafeAccent(true, '#ff9eb2')).toBe('#ff9eb2');
  });

  it('preserves accents as-is on light tinted pages or when accent is missing', () => {
    expect(resolveSafeAccent(false, '#000000')).toBe('#000000');
    expect(resolveSafeAccent(false, '#2b050b')).toBe('#2b050b');
    expect(resolveSafeAccent(true, null)).toBeNull();
    expect(resolveSafeAccent(false, null)).toBeNull();
  });
});
