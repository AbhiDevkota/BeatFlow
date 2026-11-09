import { describe, expect, it } from 'vitest';
import {
  adjustColorForDarkLayout,
  computeAndroidPalette,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
} from './artworkColor';

describe('artworkColor OKLCH', () => {
  it('converts hex to rgb and back', () => {
    const rgb = hexToRgb('#2d8095');
    expect(rgb).toEqual({ r: 45, g: 128, b: 149 });
    expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe('#2D8095');
  });

  it('adjusts pastel pink (Lover) to dark mode without losing hue', () => {
    const adjusted = adjustColorForDarkLayout(hexToRgb('#fbcedd'));
    // Should be a rich dark plum/rose
    expect(adjusted).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const rgb = hexToRgb(adjusted);
    // Red channel should dominate over green/blue
    expect(rgb.r).toBeGreaterThan(rgb.g);
    expect(rgb.r).toBeGreaterThan(rgb.b);
    // Lightness should be dark mode friendly (< 90 in 8-bit rgb)
    expect(rgb.r).toBeLessThan(95);
  });

  it('adjusts teal (Dua Lipa) to dark mode oceanic teal', () => {
    const adjusted = adjustColorForDarkLayout(hexToRgb('#2d8095'));
    expect(adjusted).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const rgb = hexToRgb(adjusted);
    // Blue and green should dominate over red
    expect(rgb.b).toBeGreaterThan(rgb.r);
    expect(rgb.g).toBeGreaterThan(rgb.r);
  });
});

describe('computeAndroidPalette', () => {
  it('computes Android ArtworkPalette tokens in dark mode', () => {
    const palette = computeAndroidPalette('#2e1b20', '#ff9eb2', true);
    expect(palette.onBackground).toBe('#FFFFFF');
    expect(palette.divider).toBe('rgba(255, 255, 255, 0.12)');
    expect(palette.wash).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.elevated).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.onBackgroundVariant).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const rgbWash = hexToRgb(palette.wash);
    const [, , lWash] = rgbToHsl(rgbWash.r, rgbWash.g, rgbWash.b);
    expect(lWash).toBeGreaterThanOrEqual(0.13);
    expect(lWash).toBeLessThanOrEqual(0.25);

    const rgbVariant = hexToRgb(palette.onBackgroundVariant);
    const [, , lVariant] = rgbToHsl(rgbVariant.r, rgbVariant.g, rgbVariant.b);
    expect(lVariant).toBeCloseTo(0.80, 1);
  });

  it('computes Android ArtworkPalette tokens in light mode', () => {
    const palette = computeAndroidPalette('#2e1b20', '#ff9eb2', false);
    expect(palette.onBackground).toBe('#000000');
    expect(palette.divider).toBe('rgba(0, 0, 0, 0.10)');
    expect(palette.wash).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const rgbWash = hexToRgb(palette.wash);
    const [, , lWash] = rgbToHsl(rgbWash.r, rgbWash.g, rgbWash.b);
    expect(lWash).toBeGreaterThanOrEqual(0.77);
    expect(lWash).toBeLessThanOrEqual(0.91);

    const rgbVariant = hexToRgb(palette.onBackgroundVariant);
    const [, , lVariant] = rgbToHsl(rgbVariant.r, rgbVariant.g, rgbVariant.b);
    expect(lVariant).toBeCloseTo(0.34, 1);
  });
});

