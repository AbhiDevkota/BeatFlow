import { useEffect, useState } from 'react';
import { sizedArtwork } from '@/lib/artwork';

/**
 * Apple Music Full-Screen Ambient Backdrop:
 * Deep, velvety dark background illuminated by the current track's album artwork,
 * blurred with a high-radius Gaussian filter and overlaid with subtle cinematic vignettes.
 * Completely eliminates color shifts, flashes, or WebGL shader delays.
 */
export function MeshBackdrop({ artworkUrl }: { artworkUrl: string | null; playing?: boolean }) {
  const [currentUrl, setCurrentUrl] = useState(artworkUrl);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);

  useEffect(() => {
    if (artworkUrl && artworkUrl !== currentUrl) {
      setPrevUrl(currentUrl);
      setCurrentUrl(artworkUrl);
      const timer = setTimeout(() => {
        setPrevUrl(null);
      }, 700);
      return () => clearTimeout(timer);
    } else if (artworkUrl && !currentUrl) {
      setCurrentUrl(artworkUrl);
    }
  }, [artworkUrl, currentUrl]);

  return (
    <div className="absolute inset-0 -z-1 overflow-hidden bg-[#0c0c0e] pointer-events-none select-none" aria-hidden="true">
      {/* Previous track blurred artwork for seamless cross-fade */}
      {prevUrl && (
        <img
          key={`prev-${prevUrl}`}
          src={sizedArtwork(prevUrl, 400)}
          alt=""
          className="absolute -inset-20 size-[calc(100%+160px)] object-cover filter blur-[84px] saturate-[1.65] brightness-[0.55] transition-opacity duration-700 ease-out opacity-0 pointer-events-none"
        />
      )}

      {/* Current track blurred artwork */}
      {currentUrl && (
        <img
          key={`curr-${currentUrl}`}
          src={sizedArtwork(currentUrl, 400)}
          alt=""
          className="absolute -inset-20 size-[calc(100%+160px)] object-cover filter blur-[84px] saturate-[1.65] brightness-[0.55] transition-opacity duration-700 ease-in opacity-100 pointer-events-none"
        />
      )}

      {/* Cinematic dark vignettes for perfect Apple Music contrast and depth */}
      <div className="absolute inset-0 bg-black/35 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_100%)] pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
    </div>
  );
}
