import { useEffect, useState } from 'react';
import { artworkAtPixels } from './artwork';

export interface ArtworkColor {
  /** The background colour behind the page ("joe colour", report §3). */
  background: string;
  /** Whether text on it should be light (a dark colour) or dark. */
  dark: boolean;
  /** Primary accent / title text colour on artwork (Apple's textColor1). */
  accent?: string | null;
  /** Interactive button / badge colour (Apple's keyColor). */
  keyColor?: string | null;
  /** Secondary text colour lifted from dominant hue (Android onBackgroundVariant). */
  secondary?: string | null;
  /** Elevated surface colour (Android elevated). */
  elevated?: string | null;
  /** Divider colour (Android divider). */
  divider?: string | null;
}

export interface AndroidArtworkPalette {
  background: string;
  wash: string;
  elevated: string;
  accent: string;
  onBackground: string;
  onBackgroundVariant: string;
  divider: string;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    if (max === rf) {
      h = ((gf - bf) / delta) % 6;
    } else if (max === gf) {
      h = (bf - rf) / delta + 2;
    } else {
      h = (rf - gf) / delta + 4;
    }
    s = delta / (1 - Math.abs(2 * l - 1));
  }

  h = (h * 60) % 360;
  if (h < 0) h += 360;
  return [Math.max(0, Math.min(360, h)), Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))];
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const m = l - 0.5 * c;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const hueSegment = Math.floor(h / 60);
  let rf = 0;
  let gf = 0;
  let bf = 0;

  switch (hueSegment) {
    case 0:
      rf = c + m; gf = x + m; bf = m; break;
    case 1:
      rf = x + m; gf = c + m; bf = m; break;
    case 2:
      rf = m; gf = c + m; bf = x + m; break;
    case 3:
      rf = m; gf = x + m; bf = c + m; break;
    case 4:
      rf = x + m; gf = m; bf = c + m; break;
    case 5:
    case 6:
      rf = c + m; gf = m; bf = x + m; break;
  }
  return {
    r: Math.round(Math.max(0, Math.min(255, rf * 255))),
    g: Math.round(Math.max(0, Math.min(255, gf * 255))),
    b: Math.round(Math.max(0, Math.min(255, bf * 255))),
  };
}

export function withHsl(
  hex: string,
  modify: { saturation?: (s: number) => number; lightness?: (l: number) => number }
): string {
  const rgb = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const newS = modify.saturation ? Math.max(0, Math.min(1, modify.saturation(s))) : s;
  const newL = modify.lightness ? Math.max(0, Math.min(1, modify.lightness(l))) : l;
  const outRgb = hslToRgb(h, newS, newL);
  return rgbToHex(outRgb.r, outRgb.g, outRgb.b);
}

const CHROMATIC_SATURATION_THRESHOLD = 0.12;

export function adaptedArtworkSaturation(source: number, minimum: number, maximum: number): number {
  const saturation = Math.max(0, Math.min(1, source));
  if (saturation < CHROMATIC_SATURATION_THRESHOLD) {
    return saturation;
  }
  return Math.max(minimum, Math.min(maximum, saturation));
}

/**
 * Direct port of Android's ArtworkPalette.kt engine for artist and release pages.
 */
export function computeAndroidPalette(
  dominantHex: string,
  vibrantHex?: string | null,
  dark: boolean = true,
): AndroidArtworkPalette {
  if (dark) {
    return {
      background: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.20, 0.62),
        lightness: () => 0.13,
      }),
      wash: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.18, 0.58),
        lightness: (l) => Math.max(0.14, Math.min(0.24, l)),
      }),
      elevated: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.20, 0.62),
        lightness: () => 0.22,
      }),
      accent: withHsl(vibrantHex || dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.55, 1.0),
        lightness: (l) => Math.max(0.62, Math.min(0.78, l)),
      }),
      onBackground: '#FFFFFF',
      onBackgroundVariant: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.22, 0.50),
        lightness: () => 0.80,
      }),
      divider: 'rgba(255, 255, 255, 0.12)',
    };
  } else {
    return {
      background: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.14, 0.50),
        lightness: () => 0.91,
      }),
      wash: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.12, 0.46),
        lightness: (l) => Math.max(0.78, Math.min(0.90, l)),
      }),
      elevated: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.14, 0.50),
        lightness: () => 0.83,
      }),
      accent: withHsl(vibrantHex || dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.55, 1.0),
        lightness: (l) => Math.max(0.30, Math.min(0.44, l)),
      }),
      onBackground: '#000000',
      onBackgroundVariant: withHsl(dominantHex, {
        saturation: (s) => adaptedArtworkSaturation(s, 0.22, 0.55),
        lightness: () => 0.34,
      }),
      divider: 'rgba(0, 0, 0, 0.10)',
    };
  }
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  if (Number.isNaN(n) || clean.length < 6) return { r: 31, g: 31, b: 31 };
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const pad = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${pad(r)}${pad(g)}${pad(b)}`.toUpperCase();
}

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function toSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, v * 255)));
}

// Björn Ottosson Oklab transform (matches Apple Music's web player engine)
export function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToRgb(L: number, a: number, b: number): RgbColor {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const lr = l_ * l_ * l_;
  const lg = m_ * m_ * m_;
  const lb = s_ * s_ * s_;
  return {
    r: toSrgb(4.0767416621 * lr - 3.3077115913 * lg + 0.2309699292 * lb),
    g: toSrgb(-1.2684380046 * lr + 2.6097574011 * lg - 0.3413193965 * lb),
    b: toSrgb(-0.0041960863 * lr - 0.7034186147 * lg + 1.7076147010 * lb),
  };
}

export function oklabToOklch(L: number, a: number, b: number): { L: number; C: number; h: number } {
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { L, C, h };
}

export function oklchToOklab(L: number, C: number, h: number): { L: number; a: number; b: number } {
  const rad = h * (Math.PI / 180);
  return {
    L,
    a: C * Math.cos(rad),
    b: C * Math.sin(rad),
  };
}

/**
 * Apple Music's exact Qnt() transformation for dark mode backgrounds:
 * Caps OKLCH Lightness to 0.30 and Chroma to 0.125 to maintain deep, rich saturation
 * without blinding or washed-out backgrounds.
 */
export function adjustColorForDarkLayout(color: RgbColor): string {
  const lab = rgbToOklab(color.r, color.g, color.b);
  const lch = oklabToOklch(lab.L, lab.a, lab.b);
  const maxL = 0.30;
  const maxC = 0.125;
  const adjL = Math.min(lch.L, maxL);
  const adjC = Math.min(lch.C, maxC);
  const lab2 = oklchToOklab(adjL, adjC, lch.h);
  const rgb = oklabToRgb(lab2.L, lab2.a, lab2.b);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Apple Music's Xnt() transformation for light mode backgrounds:
 * Keeps lightness high (>= 0.90) with subtle tinting.
 */
export function adjustColorForLightLayout(color: RgbColor): string {
  const lab = rgbToOklab(color.r, color.g, color.b);
  const lch = oklabToOklch(lab.L, lab.a, lab.b);
  const adjL = Math.max(lch.L, 0.90);
  const adjC = Math.min(lch.C, 0.05);
  const lab2 = oklchToOklab(adjL, adjC, lch.h);
  const rgb = oklabToRgb(lab2.L, lab2.a, lab2.b);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

const cache = new Map<string, ArtworkColor>();

/**
 * Extracts dominant vibrant color from artwork pixels and adjusts it via Apple's OKLCH engine.
 */
async function measure(url: string): Promise<ArtworkColor> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.src = artworkAtPixels(url, 60);
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, 16, 16);
  const { data } = context.getImageData(0, 0, 16, 16);

  let totalWeight = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = (max - min) / (max || 1);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    // Filter near-pure black and blown-out highlights for dominant hue extraction
    if (lum < 0.04 || lum > 0.96) continue;
    const weight = Math.pow(sat, 1.2) * (1 - Math.abs(lum - 0.5));
    rSum += r * weight;
    gSum += g * weight;
    bSum += b * weight;
    totalWeight += weight;
  }

  let dominant: RgbColor;
  if (totalWeight > 0) {
    dominant = {
      r: Math.round(rSum / totalWeight),
      g: Math.round(gSum / totalWeight),
      b: Math.round(bSum / totalWeight),
    };
  } else {
    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
    }
    dominant = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }

  const adjustedBg = adjustColorForDarkLayout(dominant);
  return { background: adjustedBg, dark: true };
}

export function useArtworkColor(url: string | null | undefined): ArtworkColor | null {
  const [color, setColor] = useState<ArtworkColor | null>(() => (url ? cache.get(url) ?? null : null));
  useEffect(() => {
    if (!url) return setColor(null);
    const known = cache.get(url);
    if (known) return setColor(known);
    let live = true;
    measure(url)
      .then((measured) => {
        cache.set(url, measured);
        if (live) setColor(measured);
      })
      .catch(() => {
        // An unreadable image leaves the page in its normal colours.
      });
    return () => {
      live = false;
    };
  }, [url]);
  return color;
}
