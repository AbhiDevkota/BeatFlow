import { useState } from 'react';
import { sizedArtwork } from '@/lib/artwork';
import { getCollagePalette, type TopPickItem, type TopPickMoodKey } from '@/lib/homeLayout';

interface MoodEmblemProps {
  moodKey: TopPickMoodKey;
  strokeColor?: string;
  className?: string;
}

/**
 * 1:1 Vector SVG emblems for all 28 Apple Music / BeatFlow Find Your Mood stations
 * and activities, matching Android BeatFlow's drawEmblem implementation.
 */
export function MoodEmblem({ moodKey, strokeColor = '#ffffff', className = '' }: MoodEmblemProps) {
  switch (moodKey) {
    // 1. ENERGY: Apple's slanted bolt with strobing echo flash
    case 'ENERGY':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M48.6 12.3 L88.6 12.3 L53.2 50.9 L87.7 50.9 L11.4 89.5 L40.9 61.4 L10.5 61.4 Z"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-bolt opacity-40 [transform-box:fill-box] [transform-origin:center] -translate-x-1"
          />
          <path
            d="M48.6 12.3 L88.6 12.3 L53.2 50.9 L87.7 50.9 L11.4 89.5 L40.9 61.4 L10.5 61.4 Z"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-bolt opacity-40 [transform-box:fill-box] [transform-origin:center] translate-x-1.5"
          />
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

    // 2. RELAX: Three balanced stacked stones swaying out of step
    case 'RELAX':
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

    // 3. FEELING_BLUE: Downward narrowing spiral coil
    case 'FEELING_BLUE':
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

    // 4. FEEL_GOOD: 4-point curved star pulsing and rocking
    case 'FEEL_GOOD':
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

    // 5. FOCUS: Concentric ripple rings pulsing inward
    case 'FOCUS':
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

    // 6. HEARTBREAK: Dashed heart with marching dashes
    case 'HEARTBREAK':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 50 92 L 22 62 A 16 16 0 0 1 22 32 A 16 16 0 0 1 50 42 A 16 16 0 0 1 78 32 A 16 16 0 0 1 78 62 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeDasharray="9 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-heartbreak"
          />
        </svg>
      );

    // 7. LOVE: Beating smooth heart (lub-dub swell)
    case 'LOVE':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 50 92 L 22 62 A 16 16 0 0 1 22 32 A 16 16 0 0 1 50 42 A 16 16 0 0 1 78 32 A 16 16 0 0 1 78 62 Z"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-love [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    // 8. AFTER_HOURS: Crescent moon + 3 twinkling stars
    case 'AFTER_HOURS':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Crescent Moon */}
          <path
            d="M 42 18 A 34 34 0 1 0 76 52 A 30 30 0 1 1 42 18 Z"
            stroke={strokeColor}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Star 1 */}
          <path
            d="M 80 15 Q 81 22 87 22 Q 81 22 80 29 Q 79 22 73 22 Q 79 22 80 15 Z"
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth="1.5"
            className="animate-mood-twinkle-1 [transform-box:fill-box] [transform-origin:center]"
          />
          {/* Star 2 */}
          <path
            d="M 86 53 Q 87 58 91 58 Q 87 58 86 63 Q 85 58 81 58 Q 85 58 86 53 Z"
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth="1.5"
            className="animate-mood-twinkle-2 [transform-box:fill-box] [transform-origin:center]"
          />
          {/* Star 3 */}
          <path
            d="M 68 78 Q 69 82 72 82 Q 69 82 68 86 Q 67 82 64 82 Q 67 82 68 78 Z"
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth="1.5"
            className="animate-mood-twinkle-3 [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    // 9. ALONE_TIME: Water drop ripples spreading outward across still water
    case 'ALONE_TIME':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <ellipse
            cx="50"
            cy="55"
            rx="12"
            ry="5"
            stroke={strokeColor}
            strokeWidth="3.5"
            className="animate-mood-ripple-1 [transform-box:fill-box] [transform-origin:center]"
          />
          <ellipse
            cx="50"
            cy="55"
            rx="24"
            ry="10"
            stroke={strokeColor}
            strokeWidth="3.5"
            className="animate-mood-ripple-2 [transform-box:fill-box] [transform-origin:center]"
          />
          <ellipse
            cx="50"
            cy="55"
            rx="36"
            ry="15"
            stroke={strokeColor}
            strokeWidth="3.5"
            className="animate-mood-ripple-3 [transform-box:fill-box] [transform-origin:center]"
          />
          <ellipse
            cx="50"
            cy="55"
            rx="46"
            ry="19"
            stroke={strokeColor}
            strokeWidth="3.5"
            className="animate-mood-ripple-4 [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    // 10. CHILL: Three horizontal rolling sine waves
    case 'CHILL':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <g className="overflow-hidden">
            <path
              d="M -50 32 Q -25 24 0 32 T 50 32 T 100 32 T 150 32"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-mood-wave"
            />
            <path
              d="M -50 50 Q -25 42 0 50 T 50 50 T 100 50 T 150 50"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-mood-wave [animation-delay:-1.5s]"
            />
            <path
              d="M -50 68 Q -25 60 0 68 T 50 68 T 100 68 T 150 68"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-mood-wave [animation-delay:-3s]"
            />
          </g>
        </svg>
      );

    // 11. COMMUTING: Road to the horizon with rushing perspective center dashes
    case 'COMMUTING':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Horizon line */}
          <line x1="15" y1="14" x2="85" y2="14" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
          {/* Left road line */}
          <line x1="6" y1="95" x2="44" y2="14" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          {/* Right road line */}
          <line x1="94" y1="95" x2="56" y2="14" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          {/* Perspective center dashes */}
          <line x1="50" y1="18" x2="50" y2="28" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" className="animate-mood-commute-1" />
          <line x1="50" y1="32" x2="50" y2="46" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" className="animate-mood-commute-2" />
          <line x1="50" y1="50" x2="50" y2="68" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" className="animate-mood-commute-3" />
          <line x1="50" y1="72" x2="50" y2="92" stroke={strokeColor} strokeWidth="5" strokeLinecap="round" className="animate-mood-commute-4" />
        </svg>
      );

    // 12. EATING_COOKING: Steaming bowl with 3 curling rising steam streams
    case 'EATING_COOKING':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Bowl Rim */}
          <line x1="8" y1="60" x2="92" y2="60" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          {/* Bowl Base */}
          <path
            d="M 14 60 C 14 90 86 90 86 60"
            stroke={strokeColor}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          {/* Steam streams */}
          <path
            d="M 36 52 Q 32 40 38 30 T 36 12"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            className="animate-mood-steam-1"
          />
          <path
            d="M 50 52 Q 46 38 52 28 T 50 8"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            className="animate-mood-steam-2"
          />
          <path
            d="M 64 52 Q 60 40 66 30 T 64 12"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            className="animate-mood-steam-3"
          />
        </svg>
      );

    // 13. EVENING: Setting sun dipping below horizon lines
    case 'EVENING':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <defs>
            <clipPath id="sunset-clip">
              <rect x="0" y="0" width="100" height="62" />
            </clipPath>
          </defs>
          {/* Sun disc dipping */}
          <g clipPath="url(#sunset-clip)">
            <circle
              cx="50"
              cy="60"
              r="24"
              stroke={strokeColor}
              strokeWidth="4.5"
              className="animate-mood-sunset"
            />
          </g>
          {/* Horizon line */}
          <line x1="4" y1="62" x2="96" y2="62" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          {/* Water reflection lines */}
          <line x1="20" y1="73" x2="80" y2="73" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
          <line x1="36" y1="84" x2="64" y2="84" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );

    // 14. FITNESS: ECG heartbeat trace with moving bright pulse
    case 'FITNESS':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Background trace line */}
          <path
            d="M 0 55 L 28 55 L 36 42 L 44 76 L 52 18 L 60 84 L 67 55 L 100 55"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
          {/* Animated active pulse */}
          <path
            d="M 0 55 L 28 55 L 36 42 L 44 76 L 52 18 L 60 84 L 67 55 L 100 55"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="45 180"
            className="animate-mood-ecg"
          />
        </svg>
      );

    // 15. GAMING: 3 concentric squares rotating in alternating directions
    case 'GAMING':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <rect
            x="12"
            y="12"
            width="76"
            height="76"
            stroke={strokeColor}
            strokeWidth="4"
            className="animate-mood-spin-cw [transform-box:fill-box] [transform-origin:center]"
          />
          <rect
            x="24"
            y="24"
            width="52"
            height="52"
            stroke={strokeColor}
            strokeWidth="4"
            className="animate-mood-spin-ccw [transform-box:fill-box] [transform-origin:center]"
          />
          <rect
            x="36"
            y="36"
            width="28"
            height="28"
            stroke={strokeColor}
            strokeWidth="3.5"
            className="animate-mood-spin-cw [transform-box:fill-box] [transform-origin:center]"
          />
        </svg>
      );

    // 16. HOME: House outline with glowing lamp in window
    case 'HOME':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Roof & Walls */}
          <path
            d="M 50 10 L 94 50 L 82 50 L 82 92 L 18 92 L 18 50 L 6 50 Z"
            stroke={strokeColor}
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
          {/* Door */}
          <rect x="41" y="66" width="18" height="26" stroke={strokeColor} strokeWidth="3.5" />
          {/* Window with glowing lamp */}
          <rect
            x="27"
            y="56"
            width="10"
            height="10"
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth="3"
            className="animate-mood-lamp"
          />
        </svg>
      );

    // 17. MORNING: Rising sun with rotating rays
    case 'MORNING':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <defs>
            <clipPath id="morning-clip">
              <rect x="0" y="0" width="100" height="72" />
            </clipPath>
          </defs>
          <g clipPath="url(#morning-clip)">
            {/* Sun circle */}
            <circle cx="50" cy="69" r="20" stroke={strokeColor} strokeWidth="4.5" />
            {/* Rotating sun rays */}
            <g className="animate-mood-sun-rays [transform-box:fill-box] [transform-origin:50px_69px]">
              {[0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map((deg) => (
                <line
                  key={deg}
                  x1={50 + 26 * Math.cos((deg * Math.PI) / 180)}
                  y1={69 - 26 * Math.sin((deg * Math.PI) / 180)}
                  x2={50 + 38 * Math.cos((deg * Math.PI) / 180)}
                  y2={69 - 38 * Math.sin((deg * Math.PI) / 180)}
                  stroke={strokeColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ))}
            </g>
          </g>
          {/* Horizon line */}
          <line x1="4" y1="72" x2="96" y2="72" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
        </svg>
      );

    // 18. MOTIVATION: 3 climbing chevrons ascending and fading
    case 'MOTIVATION':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <path
            d="M 22 45 L 50 28 L 78 45"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-chevrons"
          />
          <path
            d="M 22 65 L 50 48 L 78 65"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-chevrons [animation-delay:0.6s]"
          />
          <path
            d="M 22 85 L 50 68 L 78 85"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-mood-chevrons [animation-delay:1.2s]"
          />
        </svg>
      );

    // 19. OUTDOORS: Mountain silhouette with swaying sun/moon
    case 'OUTDOORS':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Mountain Ridge */}
          <path
            d="M 2 86 L 36 36 L 55 62 L 70 44 L 98 86"
            stroke={strokeColor}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="2" y1="86" x2="98" y2="86" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          {/* Sun / Moon disc */}
          <circle
            cx="78"
            cy="20"
            r="9"
            stroke={strokeColor}
            strokeWidth="4"
            className="animate-mood-drift-orb"
          />
        </svg>
      );

    // 20. PARTY: 6 spinning popping confetti stars
    case 'PARTY':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Star 1 */}
          <g className="animate-mood-confetti-1 [transform-box:fill-box] [transform-origin:24px_24px]">
            <polygon
              points="24,14 27,21 34,21 28,26 31,33 24,28 17,33 20,26 14,21 21,21"
              stroke={strokeColor}
              strokeWidth="2"
              fill={strokeColor}
              opacity="0.9"
            />
          </g>
          {/* Star 2 */}
          <g className="animate-mood-confetti-2 [transform-box:fill-box] [transform-origin:72px_18px]">
            <polygon
              points="72,10 74,15 80,15 75,19 77,25 72,21 67,25 69,19 64,15 70,15"
              stroke={strokeColor}
              strokeWidth="2"
              fill={strokeColor}
              opacity="0.9"
            />
          </g>
          {/* Star 3 (Center) */}
          <g className="animate-mood-confetti-3 [transform-box:fill-box] [transform-origin:52px_50px]">
            <polygon
              points="52,38 56,46 65,46 58,52 61,61 52,55 43,61 46,52 39,46 48,46"
              stroke={strokeColor}
              strokeWidth="2.5"
              fill={strokeColor}
              opacity="0.95"
            />
          </g>
          {/* Star 4 */}
          <g className="animate-mood-confetti-1 [transform-box:fill-box] [transform-origin:20px_72px]">
            <polygon
              points="20,64 22,69 28,69 23,73 25,79 20,75 15,79 17,73 12,69 18,69"
              stroke={strokeColor}
              strokeWidth="2"
              fill={strokeColor}
              opacity="0.85"
            />
          </g>
          {/* Star 5 */}
          <g className="animate-mood-confetti-2 [transform-box:fill-box] [transform-origin:80px_66px]">
            <polygon
              points="80,57 83,63 90,63 84,68 87,74 80,70 73,74 76,68 70,63 77,63"
              stroke={strokeColor}
              strokeWidth="2"
              fill={strokeColor}
              opacity="0.9"
            />
          </g>
          {/* Star 6 */}
          <g className="animate-mood-confetti-3 [transform-box:fill-box] [transform-origin:56px_88px]">
            <polygon
              points="56,82 58,86 63,86 59,89 61,94 56,91 51,94 53,89 49,86 54,86"
              stroke={strokeColor}
              strokeWidth="1.5"
              fill={strokeColor}
              opacity="0.8"
            />
          </g>
        </svg>
      );

    // 21. SLEEP: Closed eye breathing with radiating eyelashes
    case 'SLEEP':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <g className="animate-mood-eye [transform-box:fill-box] [transform-origin:center]">
            {/* Closed eye curve */}
            <path
              d="M 12 43 Q 50 72 88 43"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Radiating eyelashes */}
            {[30, 60, 90, 120, 150].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const bx = 50 - 38 * Math.cos(rad);
              const by = 43 + 23 * Math.sin(rad);
              const tx = bx - 10 * Math.cos(rad);
              const ty = by + 12 * Math.sin(rad);
              return (
                <line
                  key={deg}
                  x1={bx}
                  y1={by}
                  x2={tx}
                  y2={ty}
                  stroke={strokeColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        </svg>
      );

    // 22. SOCIAL: Two circles drifting together and apart
    case 'SOCIAL':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <circle
            cx="40"
            cy="50"
            r="26"
            stroke={strokeColor}
            strokeWidth="4.5"
            className="animate-mood-social-1"
          />
          <circle
            cx="60"
            cy="50"
            r="26"
            stroke={strokeColor}
            strokeWidth="4.5"
            className="animate-mood-social-2"
          />
        </svg>
      );

    // 23. SPORTS: Spinning sports ball with curved seam lines
    case 'SPORTS':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <defs>
            <clipPath id="ball-clip">
              <circle cx="50" cy="50" r="44" />
            </clipPath>
          </defs>
          <circle cx="50" cy="50" r="44" stroke={strokeColor} strokeWidth="4.5" />
          <g clipPath="url(#ball-clip)">
            <g className="animate-mood-ball-seams [transform-box:fill-box] [transform-origin:50px_50px]">
              <path
                d="M 6 50 C 30 20 70 20 94 50"
                stroke={strokeColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M 6 50 C 30 80 70 80 94 50"
                stroke={strokeColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line x1="50" y1="6" x2="50" y2="94" stroke={strokeColor} strokeWidth="4" />
            </g>
          </g>
        </svg>
      );

    // 24. SUMMERTIME: Sun with 12 rotating rays
    case 'SUMMERTIME':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Center sun circle */}
          <circle cx="50" cy="50" r="22" stroke={strokeColor} strokeWidth="4.5" />
          {/* 12 Radiating rays */}
          <g className="animate-mood-rays [transform-box:fill-box] [transform-origin:center]">
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const x1 = 50 + 31 * Math.cos(angle);
              const y1 = 50 + 31 * Math.sin(angle);
              const x2 = 50 + 46 * Math.cos(angle);
              const y2 = 50 + 46 * Math.sin(angle);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        </svg>
      );

    // 25. HOLIDAY: 6-pointed branching snowflake turning
    case 'HOLIDAY':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <g className="animate-mood-snowflake [transform-box:fill-box] [transform-origin:center]">
            {Array.from({ length: 6 }).map((_, i) => {
              const deg = i * 60;
              return (
                <g key={i} transform={`rotate(${deg} 50 50)`}>
                  {/* Main stem */}
                  <line x1="50" y1="50" x2="50" y2="6" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
                  {/* Branch 1 */}
                  <line x1="50" y1="28" x2="40" y2="20" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
                  <line x1="50" y1="28" x2="60" y2="20" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
                  {/* Branch 2 */}
                  <line x1="50" y1="16" x2="42" y2="10" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
                  <line x1="50" y1="16" x2="58" y2="10" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
                </g>
              );
            })}
          </g>
        </svg>
      );

    // 26. WEEKEND: Spinning vinyl record disc with grooves
    case 'WEEKEND':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Record edge */}
          <circle cx="50" cy="50" r="46" stroke={strokeColor} strokeWidth="4.5" />
          {/* Label ring */}
          <circle cx="50" cy="50" r="16" stroke={strokeColor} strokeWidth="3.5" />
          {/* Spindle hole */}
          <circle cx="50" cy="50" r="3" fill={strokeColor} />
          {/* Grooves spinning */}
          <g className="animate-mood-record [transform-box:fill-box] [transform-origin:center]">
            <path
              d="M 14 50 A 36 36 0 0 1 86 50"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeDasharray="22 18"
              strokeLinecap="round"
            />
            <path
              d="M 23 50 A 27 27 0 0 1 77 50"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeDasharray="18 14"
              strokeLinecap="round"
            />
          </g>
        </svg>
      );

    // 27. WELLBEING: Blooming lotus flower petals
    case 'WELLBEING':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          <g className="animate-mood-lotus [transform-box:fill-box] [transform-origin:50px_84px]">
            {/* Center petal */}
            <path
              d="M 50 84 Q 66 52 50 14 Q 34 52 50 84 Z"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinejoin="round"
            />
            {/* Left inner petal */}
            <path
              d="M 50 84 Q 52 46 28 26 Q 26 56 50 84 Z"
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Right inner petal */}
            <path
              d="M 50 84 Q 48 46 72 26 Q 74 56 50 84 Z"
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Left outer petal */}
            <path
              d="M 50 84 Q 36 54 10 44 Q 22 70 50 84 Z"
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Right outer petal */}
            <path
              d="M 50 84 Q 64 54 90 44 Q 78 70 50 84 Z"
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      );

    // 28. WORK: Laptop with typing text line and blinking cursor
    case 'WORK':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={className}>
          {/* Laptop Screen */}
          <rect x="16" y="18" width="68" height="48" rx="4" stroke={strokeColor} strokeWidth="4" />
          {/* Laptop Base */}
          <line x1="4" y1="78" x2="96" y2="78" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          <line x1="16" y1="66" x2="4" y2="78" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          <line x1="84" y1="66" x2="96" y2="78" stroke={strokeColor} strokeWidth="4.5" strokeLinecap="round" />
          {/* Text Line 1 */}
          <line x1="28" y1="36" x2="64" y2="36" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" />
          {/* Text Line 2 (typing) */}
          <line x1="28" y1="48" x2="52" y2="48" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" />
          {/* Blinking Cursor */}
          <line
            x1="57"
            y1="43"
            x2="57"
            y2="53"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            className="animate-mood-cursor"
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
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(to right, #F7334F 0%, #FA6094 38%, #F02A4A 75%, #EE213D 100%)',
      }}
    >
      <svg
        viewBox="0 0 240 320"
        fill="none"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="personal-fold-1" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FE5E83" />
            <stop offset="100%" stopColor="#FA6196" />
          </linearGradient>
          <linearGradient id="personal-fold-2" x1="0" y1="0" x2="160" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FE5065" />
            <stop offset="100%" stopColor="#FC657C" />
          </linearGradient>
          <linearGradient id="personal-fold-3" x1="0" y1="0" x2="105" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB594C" />
            <stop offset="100%" stopColor="#FC776D" />
          </linearGradient>
          <linearGradient id="personal-fold-4" x1="0" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB6729" />
            <stop offset="100%" stopColor="#F98A48" />
          </linearGradient>
        </defs>

        {/* Outer fold - pinned to right edge */}
        <path d="M 0 0 L 240 160 L 0 320 Z" fill="url(#personal-fold-1)" />

        {/* Middle fold 1 - breathing */}
        <path
          d="M 0 0 L 158 160 L 0 320 Z"
          fill="url(#personal-fold-2)"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center]"
        />

        {/* Middle fold 2 - breathing with delay */}
        <path
          d="M 0 0 L 103 160 L 0 320 Z"
          fill="url(#personal-fold-3)"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center] [animation-delay:1.5s]"
        />

        {/* Innermost fold - breathing with longer delay */}
        <path
          d="M 0 0 L 50 160 L 0 320 Z"
          fill="url(#personal-fold-4)"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center] [animation-delay:3s]"
        />
      </svg>
    </div>
  );
}

/**
 * Discovery Station Art: purple / violet angular crystalline shards fanning
 * around a forward-pointing apex arrow with an inner breathing arrow.
 */
export function DiscoveryStationArt({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(135deg, #2A869F 0%, #3477BA 100%)',
      }}
    >
      <svg
        viewBox="0 0 240 320"
        fill="none"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="discovery-arrow" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#502798" />
            <stop offset="55%" stopColor="#421C88" />
            <stop offset="100%" stopColor="#4A2292" />
          </linearGradient>

          {/* Top Shards Gradients */}
          <linearGradient id="top-shard-0" x1="240" y1="160" x2="28" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4E34B5" />
            <stop offset="100%" stopColor="#3A2496" />
          </linearGradient>
          <linearGradient id="top-shard-1" x1="240" y1="160" x2="81" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4667CC" />
            <stop offset="100%" stopColor="#2F4FB0" />
          </linearGradient>
          <linearGradient id="top-shard-2" x1="240" y1="160" x2="127" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4E42B8" />
            <stop offset="100%" stopColor="#3B30A0" />
          </linearGradient>
          <linearGradient id="top-shard-3" x1="240" y1="160" x2="168" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4395D1" />
            <stop offset="100%" stopColor="#2E7FB8" />
          </linearGradient>
          <linearGradient id="top-shard-4" x1="240" y1="160" x2="202" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3BADA0" />
            <stop offset="100%" stopColor="#27988A" />
          </linearGradient>

          {/* Bottom Shards Gradients */}
          <linearGradient id="bot-shard-0" x1="240" y1="160" x2="28" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4E34B5" />
            <stop offset="100%" stopColor="#3A2496" />
          </linearGradient>
          <linearGradient id="bot-shard-1" x1="240" y1="160" x2="81" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4A56BE" />
            <stop offset="100%" stopColor="#333EA4" />
          </linearGradient>
          <linearGradient id="bot-shard-2" x1="240" y1="160" x2="127" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4578CF" />
            <stop offset="100%" stopColor="#2F62B6" />
          </linearGradient>
          <linearGradient id="bot-shard-3" x1="240" y1="160" x2="168" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3FA2B1" />
            <stop offset="100%" stopColor="#288B99" />
          </linearGradient>
          <linearGradient id="bot-shard-4" x1="240" y1="160" x2="202" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#498ECE" />
            <stop offset="100%" stopColor="#3477BA" />
          </linearGradient>
        </defs>

        {/* Top Shards Fan */}
        <polygon points="240,160 0,0 57,0" fill="url(#top-shard-0)" className="animate-shard-drift-1" />
        <polygon points="240,160 57,0 105,0" fill="url(#top-shard-1)" className="animate-shard-drift-2" />
        <polygon points="240,160 105,0 148,0" fill="url(#top-shard-2)" className="animate-shard-drift-1" />
        <polygon points="240,160 148,0 187,0" fill="url(#top-shard-3)" className="animate-shard-drift-2" />
        <polygon points="240,160 187,0 218,0" fill="url(#top-shard-4)" className="animate-shard-drift-1" />

        {/* Bottom Shards Fan */}
        <polygon points="240,160 0,320 57,320" fill="url(#bot-shard-0)" className="animate-shard-drift-2" />
        <polygon points="240,160 57,320 105,320" fill="url(#bot-shard-1)" className="animate-shard-drift-1" />
        <polygon points="240,160 105,320 148,320" fill="url(#bot-shard-2)" className="animate-shard-drift-2" />
        <polygon points="240,160 148,320 187,320" fill="url(#bot-shard-3)" className="animate-shard-drift-1" />
        <polygon points="240,160 187,320 218,320" fill="url(#bot-shard-4)" className="animate-shard-drift-2" />

        {/* Main Apex Arrow */}
        <polygon points="0,0 240,160 0,320" fill="url(#discovery-arrow)" />

        {/* Inner Breathing Arrow */}
        <polygon
          points="0,28 196,160 0,292"
          fill="#3C1981"
          opacity="0.38"
          className="animate-station-breath [transform-box:fill-box] [transform-origin:left_center]"
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
