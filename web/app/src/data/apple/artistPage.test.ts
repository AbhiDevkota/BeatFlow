import { describe, expect, it } from 'vitest';
import { parseArtistPage } from './artistPage';

/** The shape AppleArtistArt.kt reads: the header sits somewhere in the page's hydration JSON. */
function page(header: object): string {
  const data = [{ intent: {}, data: { sections: [{ id: 'header', items: [header] }] } }];
  return `<html><script type="application/json" id="serialized-server-data">${JSON.stringify(data)}</script></html>`;
}

const hero = { url: 'https://is1-ssl.mzstatic.com/image/thumb/a/{w}x{h}{c}.{f}', width: 4320, height: 1080, bgColor: '1a2b3c', textColor1: 'f0e0d0' };

describe('parseArtistPage', () => {
  it('reads the photo, the title logo and Apple’s colours', () => {
    const art = parseArtistPage(
      page({
        artistLogo: { dictionary: { url: 'https://is1-ssl.mzstatic.com/image/thumb/logo/{w}x{h}{c}.{f}', width: 2000, height: 500 } },
        artwork: { dictionary: hero },
        keyColor: 'FA2D48',
      }),
    );
    expect(art).toEqual({
      heroUrl: 'https://is1-ssl.mzstatic.com/image/thumb/a/2880x720sr.jpg',
      heroAspect: 4,
      logoUrl: 'https://is1-ssl.mzstatic.com/image/thumb/logo/2000x500bb.png',
      logoAspect: 4,
      videoUrl: null,
      background: '#1a2b3c',
      accent: '#f0e0d0',
      keyColor: '#fa2d48',
    });
  });

  it('reads the looping video artwork and uses its previewFrame colours', () => {
    const art = parseArtistPage(
      page({
        artistLogo: null,
        artwork: { dictionary: hero },
        videoArtwork: {
          dictionary: {
            motionArtistSquare1x1: {
              video: 'https://mvod.itunes.apple.com/artist.m3u8',
              previewFrame: { bgColor: '0c1e2e', textColor1: 'b3c5ec' },
            },
          },
        },
      }),
    );
    expect(art?.videoUrl).toBe('https://mvod.itunes.apple.com/artist.m3u8');
    expect(art?.background).toBe('#0c1e2e');
    expect(art?.accent).toBe('#b3c5ec');
  });

  it('prioritizes wideVideoArtwork over square videoArtwork for desktop layout', () => {
    const art = parseArtistPage(
      page({
        artistLogo: null,
        artwork: { dictionary: hero },
        videoArtwork: {
          dictionary: {
            motionArtistSquare1x1: {
              video: 'https://mvod.itunes.apple.com/square.m3u8',
              previewFrame: { bgColor: '0c1e2e', textColor1: 'b3c5ec' },
            },
          },
        },
        wideVideoArtwork: {
          dictionary: {
            motionArtistFullscreen16x9: {
              video: 'https://mvod.itunes.apple.com/wide4k.m3u8',
              previewFrame: { bgColor: '2d8095', textColor1: '0b0404' },
            },
          },
        },
      }),
    );
    expect(art?.videoUrl).toBe('https://mvod.itunes.apple.com/wide4k.m3u8');
    expect(art?.background).toBe('#2d8095');
    expect(art?.accent).toBe('#0b0404');
  });

  it('prioritizes wideArtwork over standard artwork when present', () => {
    const wideHero = { url: 'https://is1-ssl.mzstatic.com/image/thumb/wide/{w}x{h}{c}.{f}', width: 4320, height: 2160, bgColor: '112233', textColor1: 'eeddcc' };
    const squareHero = { url: 'https://is1-ssl.mzstatic.com/image/thumb/square/{w}x{h}{c}.{f}', width: 2000, height: 2000, bgColor: '998877', textColor1: '112233' };
    const art = parseArtistPage(
      page({
        artistLogo: null,
        artwork: { dictionary: squareHero },
        wideArtwork: { dictionary: wideHero },
      }),
    );
    expect(art?.heroUrl).toBe('https://is1-ssl.mzstatic.com/image/thumb/wide/2880x1440sr.jpg');
    expect(art?.heroAspect).toBe(2);
    expect(art?.background).toBe('#112233');
  });

  it('formats square artwork to desktop banner ratio with smart ratio cropping', () => {
    const squareHero = { url: 'https://is1-ssl.mzstatic.com/image/thumb/square/{w}x{h}{c}.{f}', width: 2000, height: 2000, bgColor: '998877', textColor1: '112233' };
    const art = parseArtistPage(
      page({
        artistLogo: null,
        artwork: { dictionary: squareHero },
      }),
    );
    expect(art?.heroUrl).toBe('https://is1-ssl.mzstatic.com/image/thumb/square/2880x1492sr.jpg');
    expect(art?.heroAspect).toBeCloseTo(2880 / 1492, 2);
  });

  it('keeps the photo for an artist with no logo and no key colour', () => {
    const art = parseArtistPage(page({ artistLogo: null, artwork: { dictionary: hero } }));
    expect(art?.logoUrl).toBeNull();
    expect(art?.keyColor).toBeNull();
    expect(art?.background).toBe('#1a2b3c');
  });

  it('falls back to the colour backdrop artwork', () => {
    const art = parseArtistPage(page({ artistLogo: null, artwork: null, colorBackdropArtwork: { dictionary: hero } }));
    expect(art?.heroUrl).toContain('2880x720sr.jpg');
  });

  it('is nothing for a page without the header or with broken JSON', () => {
    expect(parseArtistPage('<html></html>')).toBeNull();
    expect(parseArtistPage('<script id="serialized-server-data">{nope</script>')).toBeNull();
    expect(parseArtistPage(page({ artistLogo: null, artwork: { dictionary: { ...hero, bgColor: '' } } }))).toBeNull();
  });
});
