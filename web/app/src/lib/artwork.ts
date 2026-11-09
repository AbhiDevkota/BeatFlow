/**
 * The square sizes YouTube Music's own pages request. googleusercontent
 * resizes on demand, and answers bursts of uncached sizes with 429 (measured:
 * 68 of 73 artwork requests on Home refused when each asked for its exact
 * displayed size). Snapping to these keeps requests on cached variants.
 */
const SQUARE_SIZES = [60, 120, 226, 544, 1200, 1800];

/** Standard wide banner sizes from YouTube Music for artist heroes and headers. */
const BANNER_SIZES = [816, 1440, 1920, 2880];

const RESIZABLE = /googleusercontent\.com|ggpht\.com/;

/**
 * Asks YouTube's image CDN for a size close to what's displayed (prompt §3):
 * the smallest standard size at least as large as the rendered pixels.
 * Supports both square covers and wide artist hero banners.
 */
export function sizedArtwork(url: string, cssPx: number, aspect = 1): string {
  if (!RESIZABLE.test(url)) return url;
  const dpr = Math.min(typeof window === 'undefined' ? 2 : window.devicePixelRatio || 1, 3);
  const needed = Math.round(cssPx * dpr);

  if (Math.abs(aspect - 1) <= 0.01) {
    const size = SQUARE_SIZES.find((s) => s >= needed) ?? SQUARE_SIZES[SQUARE_SIZES.length - 1]!;
    return artworkAtPixels(url, size);
  }

  // Non-square artwork (e.g. artist hero banners)
  const bannerW = BANNER_SIZES.find((s) => s >= needed) ?? BANNER_SIZES[BANNER_SIZES.length - 1]!;
  const bannerH = Math.round(bannerW / aspect);
  if (/=w\d+-h\d+/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${bannerW}-h${bannerH}`);
  }
  if (/=s\d+/.test(url)) {
    return url.replace(/=s\d+/, `=w${bannerW}-h${bannerH}`);
  }
  return `${url.replace(/=[^/=]*$/, '')}=w${bannerW}-h${bannerH}-p-l90-rj`;
}

/** A square artwork at an exact pixel size (Media Session, canvases). */
export function artworkAtPixels(url: string, px: number): string {
  if (!RESIZABLE.test(url)) return url;
  return `${url.replace(/=[^/=]*$/, '')}=w${px}-h${px}-l90-rj`;
}
