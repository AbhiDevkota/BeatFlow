interface PlayingBarsProps {
  className?: string;
  size?: number;
}

/**
 * Animated 3-bar soundwave equalizer, matching Android's SearchPlayingBars.
 * Overlaid on the artwork when a track is actively playing.
 */
export function PlayingBars({ className = '', size = 22 }: PlayingBarsProps) {
  return (
    <div
      className={`pointer-events-none grid place-items-center rounded-[7px] bg-black/60 backdrop-blur-xs text-white ${className}`}
      style={{ width: size, height: size }}
      aria-label="Now playing"
    >
      <div className="flex items-end justify-center gap-[2px] h-[13px] w-[13px]">
        <span
          className="w-[2px] bg-white rounded-full origin-bottom animate-eq-bar-1"
          style={{ height: '70%' }}
        />
        <span
          className="w-[2px] bg-white rounded-full origin-bottom animate-eq-bar-2"
          style={{ height: '100%' }}
        />
        <span
          className="w-[2px] bg-white rounded-full origin-bottom animate-eq-bar-3"
          style={{ height: '45%' }}
        />
      </div>
    </div>
  );
}
