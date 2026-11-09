import { describe, expect, it } from 'vitest';
import { artworkAtPixels, sizedArtwork } from './artwork';

describe('artwork', () => {
  it('sizes square artwork to standard buckets', () => {
    const url = 'https://lh3.googleusercontent.com/test=w120-h120-l90-rj';
    expect(sizedArtwork(url, 40)).toContain('w120-h120');
    expect(sizedArtwork(url, 600)).toContain('w1200-h1200');
    expect(sizedArtwork(url, 1000)).toContain('w1800-h1800');
  });

  it('sizes wide artist banners to high-DPI desktop banner sizes', () => {
    const banner = 'https://lh3.googleusercontent.com/banner=w540-h225-p-l90-rj';
    const aspect = 1165 / 604; // ~1.9288
    const sized = sizedArtwork(banner, 1400, aspect);
    expect(sized).toContain('w2880-h1493');
  });

  it('passes through non-resizable URLs untouched', () => {
    const url = 'https://i.ytimg.com/vi/test/hqdefault.jpg';
    expect(sizedArtwork(url, 600)).toBe(url);
  });

  it('formats exact square artwork at pixels', () => {
    const url = 'https://lh3.googleusercontent.com/test';
    expect(artworkAtPixels(url, 500)).toBe('https://lh3.googleusercontent.com/test=w500-h500-l90-rj');
  });
});
