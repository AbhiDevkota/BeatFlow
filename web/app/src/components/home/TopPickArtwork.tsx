import type { TopPickMoodKey } from '@/lib/homeLayout';

interface MoodEmblemProps {
  moodKey: TopPickMoodKey;
  strokeColor?: string;
  className?: string;
}

/**
 * Vector SVG emblems for Apple Music / BeatFlow's Find Your Mood stations.
 */
export function MoodEmblem({ moodKey, strokeColor = '#ffffff', className = '' }: MoodEmblemProps) {
  switch (moodKey) {
    case 'ENERGY':
      // Apple's slanted bolt
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M48.6 12.3 L88.6 12.3 L53.2 50.9 L87.7 50.9 L11.4 89.5 L40.9 61.4 L10.5 61.4 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'RELAX':
      // Three balanced stacked pebble stones
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <ellipse cx="50" cy="24" rx="22" ry="9" stroke={strokeColor} strokeWidth="5" />
          <ellipse cx="50" cy="46" rx="34" ry="14" stroke={strokeColor} strokeWidth="5" />
          <ellipse cx="50" cy="74" rx="42" ry="18" stroke={strokeColor} strokeWidth="5" />
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
          />
        </svg>
      );

    case 'FEEL_GOOD':
      // 4-point curved star
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
          />
        </svg>
      );

    case 'FOCUS':
      // Concentric ripple rings
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <circle cx="50" cy="50" r="12" stroke={strokeColor} strokeWidth="4" />
          <circle cx="50" cy="50" r="24" stroke={strokeColor} strokeWidth="4" opacity="0.85" />
          <circle cx="50" cy="50" r="36" stroke={strokeColor} strokeWidth="4" opacity="0.65" />
          <circle cx="50" cy="50" r="46" stroke={strokeColor} strokeWidth="4" opacity="0.45" />
        </svg>
      );

    case 'HEARTBREAK':
      // Dashed heart
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
          />
        </svg>
      );

    case 'LOVE':
      // Beating smooth heart
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
          />
        </svg>
      );

    default:
      return null;
  }
}

/**
 * Personal Station Art: folded chevrons/arrows in warm orange to pink.
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

        {/* Outer fold */}
        <path d="M 0 0 L 220 160 L 0 320 Z" fill="url(#fold1)" />
        {/* Middle fold 1 */}
        <path d="M 0 35 L 165 160 L 0 285 Z" fill="url(#fold2)" />
        {/* Middle fold 2 */}
        <path d="M 0 70 L 115 160 L 0 250 Z" fill="url(#fold3)" />
        {/* Innermost fold */}
        <path d="M 0 105 L 65 160 L 0 215 Z" fill="url(#fold4)" />
      </svg>
    </div>
  );
}

/**
 * Discovery Station Art: purple / violet angular crystalline shards.
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

        <polygon points="0,0 240,60 160,200 0,140" fill="url(#shard1)" />
        <polygon points="240,40 240,320 80,260 140,120" fill="url(#shard2)" />
        <polygon points="0,120 180,210 60,320 0,320" fill="url(#shard3)" />
      </svg>
    </div>
  );
}
