import { useState } from 'react';
import { sizedArtwork } from '@/lib/artwork';
import { getCollagePalette, type TopPickItem, type TopPickMoodKey } from '@/lib/homeLayout';

interface MoodEmblemProps {
  moodKey: TopPickMoodKey;
  strokeColor?: string;
  className?: string;
}

/**
 * Vector SVG emblems for Apple Music / BeatFlow's Find Your Mood stations,
 * animated with fluid keyframes matching the Android BeatFlow application.
 */
export function MoodEmblem({ moodKey, strokeColor = '#ffffff', className = '' }: MoodEmblemProps) {
  switch (moodKey) {
    case 'ENERGY':
      // Apple's slanted bolt - strobing flicker
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M48.6 12.3 L88.6 12.3 L53.2 50.9 L87.7 50.9 L11.4 89.5 L40.9 61.4 L10.5 61.4 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-bolt [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    case 'RELAX':
      // Three balanced stacked pebble stones swaying out of step
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <ellipse
            cx="50"
            cy="24"
            rx="22"
            ry="9"
            stroke={strokeColor}
            strokeWidth="5"
            className="animate-mood-sway-1 [transform-box:fill-box] [transform-origin:center]"
          />
          <ellipse
            cx="50"
            cy="46"
            rx="34"
            ry="14"
            stroke={strokeColor}
            strokeWidth="5"
            className="animate-mood-sway-2 [transform-box:fill-box] [transform-origin:center]"
          />
          <ellipse
            cx="50"
            cy="74"
            rx="42"
            ry="18"
            stroke={strokeColor}
            strokeWidth="5"
            className="animate-mood-sway-3 [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    case 'FEELING_BLUE':
      // Downward narrowing spiral
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 50 15 
               C 80 15, 80 30, 50 30 
               C 25 30, 25 45, 50 45 
               C 70 45, 70 60, 50 60 
               C 35 60, 35 72, 50 72 
               C 60 72, 60 82, 50 82
               C 42 82, 42 90, 50 90"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            className="animate-mood-spiral [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    case 'FEEL_GOOD':
      // 4-point curved star pulsing and rocking
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 50 6 
               Q 56 44 94 50 
               Q 56 56 50 94 
               Q 44 56 6 50 
               Q 44 44 50 6 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinejoin="round"
            className="animate-mood-star [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    case 'FOCUS':
      // Concentric ripple rings pulsing in toward the center
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <circle
            cx="50"
            cy="50"
            r="12"
            stroke={strokeColor}
            strokeWidth="4"
            className="animate-mood-focus [transform-box:fill-box] [transform-origin:center]"
          />
          <circle
            cx="50"
            cy="50"
            r="24"
            stroke={strokeColor}
            strokeWidth="4"
            opacity="0.85"
            className="animate-mood-focus [transform-box:fill-box] [transform-origin:center] [animation-delay:0.35s]"
          />
          <circle
            cx="50"
            cy="50"
            r="36"
            stroke={strokeColor}
            strokeWidth="4"
            opacity="0.65"
            className="animate-mood-focus [transform-box:fill-box] [transform-origin:center] [animation-delay:0.7s]"
          />
          <circle
            cx="50"
            cy="50"
            r="46"
            stroke={strokeColor}
            strokeWidth="4"
            opacity="0.45"
            className="animate-mood-focus [transform-box:fill-box] [transform-origin:center] [animation-delay:1.05s]"
          />
        </svg>
      );

    case 'HEARTBREAK':
      // Dashed heart with marching dashes
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 50 88 
               L 25 60 
               A 18 18 0 0 1 25 28 
               A 18 18 0 0 1 50 38 
               A 18 18 0 0 1 75 28 
               A 18 18 0 0 1 75 60 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeDasharray="9 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-heartbreak"
          />
        </svg>
      );

    case 'LOVE':
      // Beating smooth heart (lub-dub swell)
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 50 88 
               L 25 60 
               A 18 18 0 0 1 25 28 
               A 18 18 0 0 1 50 38 
               A 18 18 0 0 1 75 28 
               A 18 18 0 0 1 75 60 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-love [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    default:
      return null;
  }
}

/**
 * Personal Station Art: folded chevrons/arrows in warm orange to pink,
 * breathing and folding gently like Android BeatFlow.
 */
export function PersonalStationArt({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gradient-to-br from-[#FA6094] via-[#F7334F] to-[#EE213D] ${className}`}
    >
      <svg
        viewBox="0 0 240 320"
        fill="none"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="fold1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FE5E83" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FA6196" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="fold2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FE5065" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#FC657C" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="fold3" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FB594C" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#FC776D" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="fold4" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FB6729" stopOpacity="1" />
            <stop offset="100%" stopColor="#F98A48" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {/* Outer fold - pinned to left edge */}
        <path d="M 0 0 L 220 160 L 0 320 Z" fill="url(#fold1)" />
        {/* Middle fold 1 - breathing */}
        <path
          d="M 0 35 L 165 160 L 0 285 Z"
          fill="url(#fold2)"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center]"
        />
        {/* Middle fold 2 - breathing with delay */}
        <path
          d="M 0 70 L 115 160 L 0 250 Z"
          fill="url(#fold3)"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center] [animation-delay:1.5s]"
        />
        {/* Innermost fold - breathing with longer delay */}
        <path
          d="M 0 105 L 65 160 L 0 215 Z"
          fill="url(#fold4)"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center] [animation-delay:3s]"
        />
      </svg>
    </div>
  );
}

/**
 * Discovery Station Art: purple / violet angular crystalline shards drifting slowly.
 */
export function DiscoveryStationArt({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gradient-to-br from-[#1A0B2E] via-[#3A1C71] to-[#7028E4] ${className}`}
    >
      <svg
        viewBox="0 0 240 320"
        fill="none"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-90"
      >
        <defs>
          <linearGradient id="shard1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8A4BFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#4A1E99" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="shard2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CDBDFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#3C1981" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="shard3" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#9D50BB" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#6E48AA" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <polygon
          points="0,0 240,60 160,200 0,140"
          fill="url(#shard1)"
          className="animate-shard-drift-1 [transform-box:fill-box] [transform-origin:center]"
        />
        <polygon
          points="240,40 240,320 80,260 140,120"
          fill="url(#shard2)"
          className="animate-shard-drift-2 [transform-box:fill-box] [transform-origin:center]"
        />
        <polygon
          points="0,120 180,210 60,320 0,320"
          fill="url(#shard3)"
          className="animate-shard-drift-1 [transform-box:fill-box] [transform-origin:center] [animation-delay:2s]"
        />
      </svg>
    </div>
  );
}

/**
 * Card photo art for Top Picks:
 * - Artists (ARTIST_AND_SIMILAR & FEATURED_ARTIST): Android's ArtistCollageArt with
 *   vivid palette gradient, circular portrait disc, referrerPolicy="no-referrer",
 *   and fallback to artist monogram letter on error/loading so it never fails.
 * - Releases (LATEST_RELEASE): Apple Music style square cover with blurred bottom extension.
 */
export function CardPhotoArt({ pick }: { pick: TopPickItem }) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [blurLoaded, setBlurLoaded] = useState(false);

  const rawUrl = pick.thumbnail ?? null;
  const sizedUrl = rawUrl ? sizedArtwork(rawUrl, 520, 1) : null;
  const url = imgError ? rawUrl : (sizedUrl ?? rawUrl);

  const isArtist = pick.kind === 'FEATURED_ARTIST' || pick.kind === 'ARTIST_AND_SIMILAR';
  const palette = getCollagePalette(pick.title);

  // Artist card: matches Android's ArtistCollageArt
  if (isArtist) {
    const artistName = pick.title.replace(/\s*&\s*Similar$/i, '').trim();
    const initial = artistName.charAt(0).toUpperCase() || 'A';

    return (
      <div
        className="relative w-full h-full flex flex-col items-center justify-start pt-8 select-none"
        style={{
          background: `linear-gradient(to bottom, ${palette.top}, ${palette.bottom})`,
        }}
      >
        {/* Circular portrait avatar disc */}
        <div className="relative size-32 sm:size-36 rounded-full overflow-hidden shadow-2xl ring-2 ring-white/15 bg-black/25 flex items-center justify-center">
          {url && !imgError ? (
            <img
              src={url}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              draggable={false}
              className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
              onError={() => setImgError(true)}
            />
          ) : null}
          {(!loaded || imgError || !url) && (
            <span className="text-4xl sm:text-5xl font-bold text-white/90 drop-shadow select-none">
              {initial}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Release card (LATEST_RELEASE): Apple Music style with square cover and blurred lower backdrop
  return (
    <div className="relative w-full h-full overflow-hidden bg-black select-none">
      {url && (
        <>
          {/* Blurred backdrop under lower section */}
          <img
            src={url}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            draggable={false}
            className={`absolute bottom-0 inset-x-0 w-full h-[45%] object-cover filter blur-2xl opacity-60 transition-opacity duration-300 ${blurLoaded ? 'opacity-60' : 'opacity-0'}`}
            onLoad={() => setBlurLoaded(true)}
          />
          {/* Main album cover square */}
          <div className="relative w-full aspect-square overflow-hidden">
            <img
              src={url}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              draggable={false}
              className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
              onError={() => setImgError(true)}
            />
            {/* Subtle bottom fade into the blur */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-black/60 pointer-events-none" />
          </div>
        </>
      )}
    </div>
  );
}
