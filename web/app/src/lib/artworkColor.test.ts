import { describe, expect, it } from 'vitest';
import { adjustColorForDarkLayout, hexToRgb, rgbToHex } from './artworkColor';

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
