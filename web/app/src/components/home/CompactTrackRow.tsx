import { Artwork } from '@/components/music/Artwork';
import { ExplicitBadge } from '@/components/music/ExplicitBadge';
import { PlayIcon, PauseIcon } from '@/components/icons/Transport';
import { TrackMenu } from '@/components/music/TrackMenu';
import { usePlayer } from '@/state/player';
import type { Track } from '@/data/music/types';
import { PlayingBars } from './PlayingBars';

interface CompactTrackRowProps {
  track: Track;
  onPlay: () => void;
  isCurrent?: boolean;
  isPlaying?: boolean;
}

/**
 * Android BeatFlow's CompactTrackRow: 48px art with 7px corner radius,
 * active animated playing soundwave bars, title, subtitle, and context menu.
 */
export function CompactTrackRow({ track, onPlay, isCurrent, isPlaying }: CompactTrackRowProps) {
  const player = usePlayer();
  const current = isCurrent ?? (player.nowPlaying?.videoId === track.videoId);
  const activePlaying = isPlaying ?? (current && (player.status === 'playing' || player.status === 'buffering'));

  const handleClick = () => {
    if (current) {
      player.togglePlay();
    } else {
      onPlay();
    }
  };

  return (
    <div
      className="group/row flex items-center gap-3 w-full py-1.5 px-2 rounded-xl transition-colors hover:bg-thick-material/50 cursor-pointer select-none"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* 48px Artwork with 7px corner radius */}
      <div className="relative size-12 shrink-0 rounded-[7px] overflow-hidden bg-surface-secondary">
        <Artwork src={track.thumbnail} displayWidth={48} radius="7px" />

        {/* Animated Playing Bars Indicator */}
        {activePlaying ? (
          <div className="absolute inset-0 grid place-items-center bg-black/40 group-hover/row:hidden">
            <PlayingBars size={24} />
          </div>
        ) : current ? (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white group-hover/row:hidden">
            <PlayIcon size={18} />
          </div>
        ) : null}

        {/* Hover Play/Pause overlay */}
        <div className="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity duration-100 group-hover/row:opacity-100">
          {activePlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </div>
      </div>

      {/* Title & Byline */}
      <div className="flex flex-col min-w-0 flex-1 justify-center">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`truncate text-sm font-medium ${
              current ? 'text-key-accent font-semibold' : 'text-primary'
            }`}
          >
            {track.title}
          </span>
          {track.explicit && <ExplicitBadge />}
        </div>
        <span className="truncate text-xs text-secondary mt-0.5">
          {track.artists.map((a) => a.name).join(', ') || track.album?.name || ''}
        </span>
      </div>

      {/* Context Menu Button */}
      <div
        className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <TrackMenu
          track={track}
          className="grid size-7 place-items-center rounded-full text-secondary hover:text-primary hover:bg-thin-material [backdrop-filter:saturate(180%)_blur(40px)]"
        />
      </div>
    </div>
  );
}
