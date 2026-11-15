import { ChevronDown, Maximize, Minimize, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import {
  BackwardIcon,
  ForwardIcon,
  LyricsActiveIcon,
  LyricsIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  UpNextIcon,
} from '@/components/icons/Transport';
import { ExplicitBadge } from '@/components/music/ExplicitBadge';
import { PlaybackQualityLabel } from '@/components/music/PlaybackQualityLabel';
import { SourceQualityBadge } from '@/components/music/SourceQualityBadge';
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { BeatLoader } from '@/components/music/BeatLoader';
import { TrackMenu } from '@/components/music/TrackMenu';
import { albumHref } from '@/components/music/links';
import { MotionArtwork } from '@/components/music/MotionArtwork';
import { VideoSurface } from '@/components/music/VideoSurface';
import { useTrackMotion } from '@/data/apple/motionArt';
import { sizedArtwork } from '@/lib/artwork';
import { isDesktopApp } from '@/lib/platform';
import { useContentSettings } from '@/lib/contentSettings';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useHasVideo, useVideo } from '@/state/video';
import { Credits, PageLink, pageLink } from './Lcd';
import { LyricsPanel } from './LyricsPanel';
import { MeshBackdrop } from './MeshBackdrop';
import { albumPageFor } from './nowPlayingLinks';
import { UpNext } from './UpNext';
import { MixWindowHighlight, NerdStats } from './NerdStats';
import { useScrubber } from './useScrubber';
import { VideoQuality } from './VideoQuality';

function useBrowserFullScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('fullscreenchange', onChange);
      return () => document.removeEventListener('fullscreenchange', onChange);
    },
    () => document.fullscreenElement !== null,
  );
}

/** The seek line under the track's names: thicker on hover, with the times beneath its ends. */
function Scrubber() {
  const { bar, elapsed, remaining, mixLabel, dragging, handlers } = useScrubber();
  return (
    <div className="group/scrub mt-3.5" data-dragging={dragging || undefined}>
      {/* A taller hit area than the line it carries. */}
      <div className="group/hit flex h-4 cursor-pointer touch-none items-center" {...handlers}>
        <div
          className="relative h-1 flex-1 overflow-hidden rounded-[999px] bg-quaternary transition-[height] duration-120 ease-in group-hover/hit:h-2 group-data-dragging/scrub:h-2"
          aria-hidden="true"
        >
          <MixWindowHighlight />
          <div
            ref={bar}
            className="relative size-full origin-left scale-x-(--progress) bg-secondary transition-[background-color] duration-120 ease-in [--progress:0] group-hover/hit:bg-primary group-data-dragging/scrub:bg-primary"
          />
        </div>
      </div>
      <div className="relative mt-0.5 flex items-center justify-between type-[500_11px/14px] tabular-nums text-tertiary">
        <span ref={elapsed} />
        {/* PlaybackQualityLabel between the timestamps — 1-to-1 with Android */}
        <div className="pointer-events-auto absolute inset-x-0 flex justify-center">
          <PlaybackQualityLabel />
        </div>
        <span ref={mixLabel} className="pointer-events-none absolute inset-x-0 text-center text-secondary opacity-0" aria-hidden="true">
          Mixing
        </span>
        <span ref={remaining} />
      </div>
    </div>
  );
}

const transportButton =
  'grid place-items-center rounded-full transition-[background-color,scale] duration-100 ease-in enabled:hover:bg-quinary enabled:active:scale-90 disabled:opacity-40';
// Shuffle and repeat, when on: full white on the mesh, where red would clash.
const toggle = `${transportButton} size-9 text-tertiary aria-pressed:text-primary`;
const skip = `${transportButton} size-12 text-primary`;

/** Shuffle, previous, play/pause, next, repeat matching outer artwork/scrubber alignment. */
function Transport() {
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const isBuffering = usePlayer((s) => s.status === 'buffering' || s.status === 'loading');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();

  return (
    <div className="mt-[clamp(10px,1.8vh,18px)] flex h-14 w-full items-center justify-between">
      <div className="grid size-9 place-items-center">
        <button className={toggle} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
          <ShuffleIcon size={26} />
        </button>
      </div>

      <div className="flex flex-1 max-w-[calc(100%-clamp(116px,35%,160px))] items-center justify-between px-1">
        <div className="grid size-12 place-items-center">
          <button className={skip} disabled={!hasTrack} aria-label="Previous" onClick={previous}>
            <BackwardIcon size={38} />
          </button>
        </div>

        <button className={`${transportButton} size-14 text-primary`} disabled={!hasTrack} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
          {isBuffering ? (
            <BeatLoader size={28} />
          ) : playing ? (
            <PauseIcon size={46} />
          ) : (
            <PlayIcon size={46} />
          )}
        </button>

        <div className="grid size-12 place-items-center">
          <button className={skip} disabled={!hasTrack || !hasNext} aria-label="Next" onClick={next}>
            <ForwardIcon size={38} />
          </button>
        </div>
      </div>

      <div className="grid size-9 place-items-center">
        <button
          className={toggle}
          aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat'}
          aria-pressed={repeat !== 'off'}
          onClick={cycleRepeat}
        >
          {repeat === 'one' ? <RepeatOneIcon size={26} /> : <RepeatIcon size={26} />}
        </button>
      </div>
    </div>
  );
}

/** Android-style horizontal volume bar aligned with Previous and Next controls */
function PlayerVolumeBar() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const level = muted ? 0 : volume;
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const stop = () => setIsDragging(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [isDragging]);

  return (
    <div className="mt-[clamp(10px,1.8vh,18px)] flex h-8 w-full items-center justify-between">
      {/* Left spacer matching shuffle (size-9) */}
      <div className="size-9 shrink-0" aria-hidden="true" />

      {/* Center volume section: aligned under Previous and Next */}
      <div className="flex flex-1 max-w-[calc(100%-clamp(116px,35%,160px))] items-center gap-3 px-1">
        <div className="grid size-12 place-items-center">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
          >
            {muted || level === 0 ? (
              <VolumeX size={18} strokeWidth={1.8} />
            ) : (
              <Volume1 size={18} strokeWidth={1.8} />
            )}
          </button>
        </div>

        {/* Volume bar matching the player bar (Scrubber): pill line that expands on hover/drag, no dot */}
        <div
          className="group/vol relative flex h-5 flex-1 cursor-pointer items-center"
          data-dragging={isDragging || undefined}
        >
          {/* Expanding track */}
          <div className="relative h-1 w-full overflow-hidden rounded-[999px] bg-white/20 transition-[height] duration-120 ease-in group-hover/vol:h-2 group-data-dragging/vol:h-2">
            {/* Smooth animated fill */}
            <div
              className={`h-full rounded-[999px] bg-white transition-[background-color] duration-120 ease-in ${
                isDragging ? '' : 'transition-[width] duration-300 ease-out'
              }`}
              style={{ width: `${level * 100}%` }}
            />
          </div>

          {/* Accessible input overlay */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={level}
            aria-label="Volume"
            onPointerDown={() => setIsDragging(true)}
            onPointerUp={() => setIsDragging(false)}
            onPointerCancel={() => setIsDragging(false)}
            onChange={(e) => setVolume(Number(e.currentTarget.value))}
            className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          />
        </div>

        <div className="grid size-12 place-items-center">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Full volume"
            onClick={() => setVolume(1)}
          >
            <Volume2 size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Right spacer matching repeat (size-9) */}
      <div className="size-9 shrink-0" aria-hidden="true" />
    </div>
  );
}

/** Android-style bottom action row (Lyrics on left, Up Next / Playlist on right) */
function PlayerActionRow({
  showLyrics,
  showQueue,
  onToggleLyrics,
  onToggleQueue,
}: {
  showLyrics: boolean;
  showQueue: boolean;
  onToggleLyrics: () => void;
  onToggleQueue: () => void;
}) {
  return (
    <div className="mt-[clamp(12px,2vh,20px)] flex h-10 w-full items-center justify-between">
      <div className="grid size-9 place-items-center">
        <button
          type="button"
          aria-label="Lyrics"
          aria-pressed={showLyrics}
          onClick={onToggleLyrics}
          className={`grid size-9 place-items-center rounded-full transition-all duration-150 ${
            showLyrics
              ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/30'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {showLyrics ? <LyricsActiveIcon size={20} /> : <LyricsIcon size={20} />}
        </button>
      </div>

      <div className="grid size-9 place-items-center">
        <button
          type="button"
          aria-label="Up Next"
          aria-pressed={showQueue}
          onClick={onToggleQueue}
          className={`grid size-9 place-items-center rounded-full transition-all duration-150 ${
            showQueue
              ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/30'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          <UpNextIcon size={20} />
        </button>
      </div>
    </div>
  );
}

// Close, browser full screen, the column toggles and the speaker, in the corners.
const chromeButton =
  'grid size-8 place-items-center rounded-full text-secondary transition-[background-color,color] duration-100 ease-in hover:bg-quinary hover:text-primary';
const chrome = `absolute z-1 ${chromeButton}`;

/** How long the pointer can rest before a playing music video hides its controls. */
const IDLE_MS = 3000;

export interface FullScreenPlayerProps {
  open?: boolean;
  onDismissed?: () => void;
}

/**
 * The full-screen player (report §7): the artwork on the left with the
 * track's names, the seek line and the transport under it; the lyrics, the
 * same am-lyrics panel as the side panel's, on the right; all over a mesh
 * gradient of the artwork's colours. With the lyrics closed, the artwork
 * column sits in the middle on its own, as Apple's does.
 *
 * A music video plays as Apple's do: on its own, it fills the window with
 * the names and transport over its foot, fading out while the pointer rests;
 * beside the lyrics or Up Next, it takes the artwork's place at 16:9.
 */
export function FullScreenPlayer({ open = true, onDismissed }: FullScreenPlayerProps) {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  // The queue's row for what's playing: it carries the album and each artist's channel.
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  // Apple's animated sleeve over the cover, as the phone's now-playing shows it.
  const motion = useTrackMotion(nowPlaying?.title, nowPlaying?.artist, track?.album?.name);
  const { pathname } = useLocation();
  const openedAt = useRef(pathname);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const setFullScreen = useUi((s) => s.setFullScreen);
  const video = useHasVideo(nowPlaying?.videoId);
  const squareVideoThumbnails = useContentSettings((s) => s.squareVideoThumbnails);
  // The right-hand column: the lyrics, Up Next, or nothing. Lyrics toggle bottom left, Up Next bottom right.
  // A music video opens on its own, without the lyrics.
  const [panel, setPanel] = useState<'lyrics' | 'queue' | null>(() =>
    nowPlaying && useVideo.getState().videoId === nowPlaying.videoId ? null : 'lyrics',
  );
  // Once the listener picks a column, a video arriving late doesn't take it away.
  const picked = useRef(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browserFullScreen = useBrowserFullScreen();
  const close = useRef<HTMLButtonElement>(null);
  // Whether this player put the page in the browser's full screen, so closing it leaves it again.
  const enteredBrowserFullScreen = useRef(false);

  // Animation & gesture refs
  const sheetRef = useRef<HTMLDivElement>(null);
  const cardBgRef = useRef<HTMLDivElement>(null);
  const artworkMorphRef = useRef<HTMLDivElement>(null);
  const infoMorphRef = useRef<HTMLDivElement>(null);
  const titleActionsRef = useRef<HTMLDivElement>(null);
  const scrubberMorphRef = useRef<HTMLDivElement>(null);
  const transportMorphRef = useRef<HTMLDivElement>(null);
  const extraControlsRef = useRef<HTMLDivElement>(null);
  const sideColumnRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<'initial' | 'expanding' | 'expanded' | 'collapsing' | 'collapsed'>('initial');
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissedRef = useRef(onDismissed);

  useEffect(() => {
    onDismissedRef.current = onDismissed;
  }, [onDismissed]);

  // The column follows the toggle alone: whether this track has lyrics, and
  // from which provider, is the panel's own business to say.
  const showLyrics = panel === 'lyrics';
  const showQueue = panel === 'queue';
  const togglePanel = (p: 'lyrics' | 'queue') => {
    picked.current = true;
    setPanel((on) => (on === p ? null : p));
  };

  useEffect(() => {
    if (video && !picked.current) setPanel(null);
  }, [video]);

  const wake = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => {
      if (enteredBrowserFullScreen.current && document.fullscreenElement) void document.exitFullscreen();
      opener?.focus({ preventScroll: true });
    };
  }, []);

  const getMiniCoords = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const pillEl = document.getElementById('miniplayer-pill');
    const artEl = document.getElementById('miniplayer-artwork');
    const infoEl = document.getElementById('miniplayer-info');
    const transEl = document.getElementById('miniplayer-transport');
    const scrubEl = document.getElementById('miniplayer-scrubber');

    const pillRect = pillEl?.getBoundingClientRect();
    const validPill = pillRect && pillRect.width > 0 && pillRect.height > 0;

    const pill = validPill
      ? pillRect
      : new DOMRect(
          Math.max(16, (vw - Math.min(668, vw - 32)) / 2),
          vh - 76,
          Math.min(668, vw - 32),
          56,
        );

    const art = artEl && artEl.getBoundingClientRect().width > 0
      ? artEl.getBoundingClientRect()
      : new DOMRect(pill.left + 200, pill.top + 11, 34, 34);

    const info = infoEl && infoEl.getBoundingClientRect().width > 0
      ? infoEl.getBoundingClientRect()
      : new DOMRect(pill.left + 242, pill.top + 11, Math.min(240, pill.width - 390), 34);

    const trans = transEl && transEl.getBoundingClientRect().width > 0
      ? transEl.getBoundingClientRect()
      : new DOMRect(pill.left + 16, pill.top + 8, 170, 40);

    const scrub = scrubEl && scrubEl.getBoundingClientRect().width > 0
      ? scrubEl.getBoundingClientRect()
      : new DOMRect(pill.left + 200, pill.bottom - 8, Math.min(280, pill.width - 340), 4);

    return { pill, art, info, trans, scrub };
  };

  // Hardware-accelerated Apple Matched-Geometry FLIP Expansion on Mount
  useLayoutEffect(() => {
    const cardBgEl = cardBgRef.current;
    const artEl = artworkMorphRef.current;
    const infoEl = infoMorphRef.current;
    const transEl = transportMorphRef.current;
    const scrubEl = scrubberMorphRef.current;
    const extraEl = extraControlsRef.current;
    const actionsEl = titleActionsRef.current;
    const headerEl = headerRef.current;
    const sideEl = sideColumnRef.current;
    const sheetEl = sheetRef.current;

    if (!cardBgEl || !artEl || !infoEl || !transEl || !scrubEl || !sheetEl) return;

    const { pill: miniPill, art: miniArt, info: miniInfo, trans: miniTrans, scrub: miniScrub } = getMiniCoords();

    const sheetRect = sheetEl.getBoundingClientRect();
    const fullWidth = sheetRect.width || window.innerWidth;
    const fullHeight = sheetRect.height || window.innerHeight;

    // Measure full-screen elements
    const fullArt = artEl.getBoundingClientRect();
    const fullInfo = infoEl.getBoundingClientRect();
    const fullTrans = transEl.getBoundingClientRect();
    const fullScrub = scrubEl.getBoundingClientRect();

    // 1. Calculate deltas for Card Background
    const cardDx = miniPill.left - sheetRect.left;
    const cardDy = miniPill.top - sheetRect.top;
    const cardScaleX = Math.max(0.01, miniPill.width / fullWidth);
    const cardScaleY = Math.max(0.01, miniPill.height / fullHeight);
    const rx = 28 / cardScaleX;
    const ry = 28 / cardScaleY;

    // 2. Calculate deltas for Artwork
    const artDx = miniArt.left - fullArt.left;
    const dyArt = miniArt.top - fullArt.top;
    const artScale = Math.max(0.01, miniArt.width / fullArt.width);
    const artRadius = 6 / artScale;

    // 3. Calculate deltas for Title & Artist
    const infoDx = miniInfo.left - fullInfo.left;
    const dyInfo = miniInfo.top - fullInfo.top;
    const infoScale = Math.min(1, Math.max(0.45, miniInfo.height / fullInfo.height));

    // 4. Calculate deltas for Transport Controls
    const transDx = (miniTrans.left + miniTrans.width / 2) - (fullTrans.left + fullTrans.width / 2);
    const dyTrans = (miniTrans.top + miniTrans.height / 2) - (fullTrans.top + fullTrans.height / 2);
    const transScale = Math.min(1, Math.max(0.35, miniTrans.width / fullTrans.width));

    // 5. Calculate deltas for Scrubber
    const scrubDx = miniScrub.left - fullScrub.left;
    const dyScrub = miniScrub.top - fullScrub.top;
    const scrubScaleX = Math.max(0.01, miniScrub.width / fullScrub.width);

    // Apply Inverted state (t=0)
    cardBgEl.style.transition = 'none';
    cardBgEl.style.transformOrigin = '0 0';
    cardBgEl.style.transform = `translate3d(${cardDx}px, ${cardDy}px, 0) scale(${cardScaleX}, ${cardScaleY})`;
    cardBgEl.style.borderRadius = `${rx}px / ${ry}px`;
    cardBgEl.style.overflow = 'hidden';

    artEl.style.transition = 'none';
    artEl.style.transformOrigin = '0 0';
    artEl.style.transform = `translate3d(${artDx}px, ${dyArt}px, 0) scale(${artScale})`;
    artEl.style.borderRadius = `${artRadius}px`;

    infoEl.style.transition = 'none';
    infoEl.style.transformOrigin = '0 0';
    infoEl.style.transform = `translate3d(${infoDx}px, ${dyInfo}px, 0) scale(${infoScale})`;

    transEl.style.transition = 'none';
    transEl.style.transformOrigin = 'center center';
    transEl.style.transform = `translate3d(${transDx}px, ${dyTrans}px, 0) scale(${transScale})`;

    scrubEl.style.transition = 'none';
    scrubEl.style.transformOrigin = '0 0';
    scrubEl.style.transform = `translate3d(${scrubDx}px, ${dyScrub}px, 0) scale(${scrubScaleX}, 0.5)`;

    if (extraEl) {
      extraEl.style.transition = 'none';
      extraEl.style.transform = 'translate3d(0, 24px, 0)';
      extraEl.style.opacity = '0';
    }

    if (actionsEl) {
      actionsEl.style.transition = 'none';
      actionsEl.style.transform = 'translate3d(0, 14px, 0)';
      actionsEl.style.opacity = '0';
    }

    if (headerEl) {
      headerEl.style.transition = 'none';
      headerEl.style.transform = 'translate3d(0, -20px, 0)';
      headerEl.style.opacity = '0';
    }

    if (sideEl) {
      sideEl.style.transition = 'none';
      sideEl.style.transform = 'translate3d(24px, 0, 0)';
      sideEl.style.opacity = '0';
    }

    // Force layout flush so browser renders the initial inverted frame
    void cardBgEl.offsetHeight;
    void artEl.offsetHeight;

    // Trigger Play Animation (t=1): Luxurious 620ms Apple fluid spring
    const easeApple = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const rafId = requestAnimationFrame(() => {
      phaseRef.current = 'expanding';

      cardBgEl.style.transition = `transform 620ms ${easeApple}, border-radius 620ms ease-out`;
      cardBgEl.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
      cardBgEl.style.borderRadius = '0px';

      artEl.style.transition = `transform 620ms ${easeApple}, border-radius 620ms ease-out`;
      artEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
      artEl.style.borderRadius = '22px';

      infoEl.style.transition = `transform 620ms ${easeApple}`;
      infoEl.style.transform = 'translate3d(0, 0, 0) scale(1)';

      transEl.style.transition = `transform 620ms ${easeApple}`;
      transEl.style.transform = 'translate3d(0, 0, 0) scale(1)';

      scrubEl.style.transition = `transform 620ms ${easeApple}`;
      scrubEl.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';

      if (extraEl) {
        extraEl.style.transition = `transform 540ms ${easeApple} 100ms, opacity 440ms ease-out 100ms`;
        extraEl.style.transform = 'translate3d(0, 0, 0)';
        extraEl.style.opacity = '1';
      }

      if (actionsEl) {
        actionsEl.style.transition = `transform 500ms ${easeApple} 80ms, opacity 400ms ease-out 80ms`;
        actionsEl.style.transform = 'translate3d(0, 0, 0)';
        actionsEl.style.opacity = '1';
      }

      if (headerEl) {
        headerEl.style.transition = `transform 480ms ${easeApple} 80ms, opacity 380ms ease-out 80ms`;
        headerEl.style.transform = 'translate3d(0, 0, 0)';
        headerEl.style.opacity = '1';
      }

      if (sideEl) {
        sideEl.style.transition = `transform 520ms ${easeApple} 100ms, opacity 420ms ease-out 100ms`;
        sideEl.style.transform = 'translate3d(0, 0, 0)';
        sideEl.style.opacity = '1';
      }
    });

    const timer = setTimeout(() => {
      phaseRef.current = 'expanded';
      cardBgEl.style.transition = '';
      cardBgEl.style.transform = '';
      cardBgEl.style.borderRadius = '';
      artEl.style.transition = '';
      artEl.style.transform = '';
      artEl.style.borderRadius = '';
      infoEl.style.transition = '';
      infoEl.style.transform = '';
      transEl.style.transition = '';
      transEl.style.transform = '';
      scrubEl.style.transition = '';
      scrubEl.style.transform = '';
      if (extraEl) {
        extraEl.style.transition = '';
        extraEl.style.transform = '';
        extraEl.style.opacity = '';
      }
      if (actionsEl) {
        actionsEl.style.transition = '';
        actionsEl.style.transform = '';
        actionsEl.style.opacity = '';
      }
      if (headerEl) {
        headerEl.style.transition = '';
        headerEl.style.transform = '';
        headerEl.style.opacity = '';
      }
      if (sideEl) {
        sideEl.style.transition = '';
        sideEl.style.transform = '';
        sideEl.style.opacity = '';
      }
    }, 660);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, []);

  // Collapse / Minimize Animation with Symmetrical Apple Return
  const startCollapse = useCallback(() => {
    if (phaseRef.current === 'collapsing' || phaseRef.current === 'collapsed') return;
    phaseRef.current = 'collapsing';

    const cardBgEl = cardBgRef.current;
    const artEl = artworkMorphRef.current;
    const infoEl = infoMorphRef.current;
    const transEl = transportMorphRef.current;
    const scrubEl = scrubberMorphRef.current;
    const extraEl = extraControlsRef.current;
    const actionsEl = titleActionsRef.current;
    const headerEl = headerRef.current;
    const sideEl = sideColumnRef.current;
    const sheetEl = sheetRef.current;

    const collapseEase = 'cubic-bezier(0.32, 0.72, 0, 1)';

    // Measure LIVE coordinates of miniplayer elements for pixel-perfect retrieval
    const { pill: livePill, art: liveArt, info: liveInfo, trans: liveTrans, scrub: liveScrub } = getMiniCoords();

    const sheetRect = sheetEl ? sheetEl.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const fullWidth = sheetRect.width || window.innerWidth;
    const fullHeight = sheetRect.height || window.innerHeight;

    const fullArt = artEl?.getBoundingClientRect();
    const fullInfo = infoEl?.getBoundingClientRect();
    const fullTrans = transEl?.getBoundingClientRect();
    const fullScrub = scrubEl?.getBoundingClientRect();

    const cardDx = livePill.left - sheetRect.left;
    const cardDy = livePill.top - sheetRect.top;
    const cardScaleX = Math.max(0.01, livePill.width / fullWidth);
    const cardScaleY = Math.max(0.01, livePill.height / fullHeight);
    const rx = 28 / cardScaleX;
    const ry = 28 / cardScaleY;

    if (sheetEl) {
      sheetEl.style.transition = `transform 500ms ${collapseEase}, border-radius 500ms ease-out`;
      sheetEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
      sheetEl.style.borderRadius = '0px';
    }

    if (cardBgEl) {
      cardBgEl.style.transition = `transform 500ms ${collapseEase}, border-radius 500ms ease-out`;
      cardBgEl.style.transformOrigin = '0 0';
      cardBgEl.style.transform = `translate3d(${cardDx}px, ${cardDy}px, 0) scale(${cardScaleX}, ${cardScaleY})`;
      cardBgEl.style.borderRadius = `${rx}px / ${ry}px`;
    }

    if (artEl && fullArt) {
      const artDx = liveArt.left - fullArt.left;
      const dyArt = liveArt.top - fullArt.top;
      const artScale = Math.max(0.01, liveArt.width / fullArt.width);
      const artRadius = 6 / artScale;

      artEl.style.transition = `transform 500ms ${collapseEase}, border-radius 480ms ease-out`;
      artEl.style.transformOrigin = '0 0';
      artEl.style.transform = `translate3d(${artDx}px, ${dyArt}px, 0) scale(${artScale})`;
      artEl.style.borderRadius = `${artRadius}px`;
    }

    if (infoEl && fullInfo) {
      const infoDx = liveInfo.left - fullInfo.left;
      const dyInfo = liveInfo.top - fullInfo.top;
      const infoScale = Math.min(1, Math.max(0.45, liveInfo.height / fullInfo.height));

      infoEl.style.transition = `transform 480ms ${collapseEase}`;
      infoEl.style.transformOrigin = '0 0';
      infoEl.style.transform = `translate3d(${infoDx}px, ${dyInfo}px, 0) scale(${infoScale})`;
    }

    if (transEl && fullTrans) {
      const transDx = (liveTrans.left + liveTrans.width / 2) - (fullTrans.left + fullTrans.width / 2);
      const dyTrans = (liveTrans.top + liveTrans.height / 2) - (fullTrans.top + fullTrans.height / 2);
      const transScale = Math.min(1, Math.max(0.35, liveTrans.width / fullTrans.width));

      transEl.style.transition = `transform 480ms ${collapseEase}`;
      transEl.style.transformOrigin = 'center center';
      transEl.style.transform = `translate3d(${transDx}px, ${dyTrans}px, 0) scale(${transScale})`;
    }

    if (scrubEl && fullScrub) {
      const scrubDx = liveScrub.left - fullScrub.left;
      const dyScrub = liveScrub.top - fullScrub.top;
      const scrubScaleX = Math.max(0.01, liveScrub.width / fullScrub.width);

      scrubEl.style.transition = `transform 480ms ${collapseEase}`;
      scrubEl.style.transformOrigin = '0 0';
      scrubEl.style.transform = `translate3d(${scrubDx}px, ${dyScrub}px, 0) scale(${scrubScaleX}, 0.5)`;
    }

    // Secondary controls fade out gracefully
    if (extraEl) {
      extraEl.style.transition = 'transform 200ms ease-out, opacity 180ms ease-out';
      extraEl.style.transform = 'translate3d(0, 16px, 0)';
      extraEl.style.opacity = '0';
    }

    if (actionsEl) {
      actionsEl.style.transition = 'transform 180ms ease-out, opacity 160ms ease-out';
      actionsEl.style.transform = 'translate3d(0, 14px, 0)';
      actionsEl.style.opacity = '0';
    }

    if (headerEl) {
      headerEl.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
      headerEl.style.transform = 'translate3d(0, -20px, 0)';
      headerEl.style.opacity = '0';
    }

    if (sideEl) {
      sideEl.style.transition = 'opacity 180ms ease-out';
      sideEl.style.opacity = '0';
    }

    // Seamless handoff: return PlayerBar visibility as collapse finishes landing
    const handoffTimer = setTimeout(() => {
      setFullScreen(false);
    }, 420);

    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      clearTimeout(handoffTimer);
      setFullScreen(false);
      phaseRef.current = 'collapsed';
      onDismissedRef.current?.();
    }, 500);
  }, [setFullScreen]);

  // Synchronize when open prop changes
  useEffect(() => {
    if (!open && (phaseRef.current === 'expanded' || phaseRef.current === 'expanding')) {
      startCollapse();
    }
  }, [open, startCollapse]);

  // A title, artist or album link went somewhere: get out of the way so the page shows.
  useEffect(() => {
    if (pathname !== openedAt.current) startCollapse();
  }, [pathname, startCollapse]);

  // Nothing left to show once the queue ends.
  useEffect(() => {
    if (!nowPlaying) startCollapse();
  }, [nowPlaying, startCollapse]);

  // Interactive Swipe / Drag Down Gesture to dismiss
  const dragRef = useRef<{
    pointerId: number | null;
    startY: number;
    startX: number;
    isDragging: boolean;
  }>({
    pointerId: null,
    startY: 0,
    startX: 0,
    isDragging: false,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    wake();
    if (phaseRef.current !== 'expanded') return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('button, a, input, select, textarea, [role="button"], [role="slider"], [data-no-drag]')) {
      return;
    }
    if (target.closest('.overflow-y-auto, .overflow-y-scroll, [data-scrollable]')) {
      return;
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startX: e.clientX,
      isDragging: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    wake();
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId) return;

    const dy = e.clientY - drag.startY;
    const dx = e.clientX - drag.startX;

    if (!drag.isDragging) {
      if (dy > 8 && dy > Math.abs(dx)) {
        drag.isDragging = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // fallback
        }
      } else if (Math.abs(dx) > 10 || dy < -10) {
        drag.pointerId = null;
        return;
      }
    }

    if (drag.isDragging && sheetRef.current) {
      const pullY = Math.max(0, dy);
      const pullScale = Math.max(0.92, 1 - pullY / 2400);
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translate3d(0, ${pullY}px, 0) scale(${pullScale})`;
      sheetRef.current.style.borderRadius = `${Math.min(28, (pullY / 120) * 28)}px`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId) return;

    const dy = e.clientY - drag.startY;
    const wasDragging = drag.isDragging;
    drag.pointerId = null;
    drag.isDragging = false;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (wasDragging) {
      if (dy > 90) {
        startCollapse();
      } else if (sheetRef.current) {
        const easeApple = 'cubic-bezier(0.25, 1, 0.35, 1)';
        sheetRef.current.style.transition = `transform 300ms ${easeApple}, border-radius 300ms ease-out`;
        sheetRef.current.style.transform = 'translate3d(0, 0, 0) scale(1)';
        sheetRef.current.style.borderRadius = '0px';
      }
    }
  };

  const toggleBrowserFullScreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // The whole page, not this overlay: menus and dialogs portal to <body> and must stay visible.
      void document.documentElement.requestFullscreen().then(
        () => (enteredBrowserFullScreen.current = true),
        () => undefined,
      );
    }
  };

  if (!nowPlaying) return null;
  const { videoId, title, artist } = nowPlaying;
  const album = track?.album ?? null;
  // With a right-hand column; on narrow windows that column fills the screen and the controls sit under it, without the artwork.
  const column = showLyrics || showQueue;
  // A music video on its own fills the window.
  const theater = video && !column;
  // ...and hides the controls and the pointer while it plays undisturbed.
  const hidden = theater && playing && idle ? ' pointer-events-none opacity-0' : '';
  const corner = `${chrome} transition-[background-color,color,opacity] duration-300${hidden}`;

  return (
    <div
      ref={sheetRef}
      // Over everything but menus and dialogs, which portal above it. Pure GPU compositor layer for 120 FPS.
      className="fixed inset-0 z-[calc(var(--z-contextual-menus)-2)] isolate overflow-hidden text-primary will-change-transform [--art:min(35vw,calc(100dvh-310px),520px)] motion-reduce:transition-none max-md:[--art:min(86vw,calc(100dvh-340px),420px)]"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      data-full-screen
      data-paused={!playing || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={wake}
      style={theater && playing && idle ? { cursor: 'none' } : undefined}
    >
      {/* Background card that expands from the miniplayer pill */}
      <div
        ref={cardBgRef}
        className="pointer-events-none absolute inset-0 will-change-transform shadow-[0_16px_50px_rgba(0,0,0,0.5)]"
      >
        <MeshBackdrop artworkUrl={nowPlaying.artworkUrl} playing={playing} />
        {theater && (
          <div className="absolute inset-0 animate-fade-in bg-black">
            <VideoSurface fit="contain" className="size-full" />
          </div>
        )}
        {/* Subtle glass inner highlight */}
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),inset_0_-0.5px_0_0_rgba(0,0,0,0.3)]" />
      </div>

      {/* Top Header Row (minimize chevron, gesture grabber, video quality & full screen) */}
      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 will-change-transform [&_button]:pointer-events-auto"
      >
        <button
          ref={close}
          className={`${corner} size-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white/90 hover:text-white flex items-center justify-center transition-all backdrop-blur-md shadow-sm`}
          aria-label="Minimize"
          onClick={startCollapse}
        >
          <ChevronDown size={22} strokeWidth={2.5} />
        </button>

        {/* Top grabber indicator matching Apple sheet gesture */}
        <div className="pointer-events-none flex justify-center opacity-70">
          <div className="h-1.5 w-10 rounded-full bg-white/35 backdrop-blur-md shadow-xs" />
        </div>

        <div className="flex items-center gap-2">
          {video && <VideoQuality className={`relative z-1${hidden}`} />}
          {video && document.fullscreenEnabled && (
            <button
              className={corner}
              aria-label={browserFullScreen ? 'Exit full screen' : 'Enter full screen'}
              onClick={toggleBrowserFullScreen}
            >
              {browserFullScreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Apple's grid areas "controls lyrics": the artwork column, then the lyrics. */}
      <div
        className={
          theater
            ? `absolute inset-x-0 bottom-0 flex justify-center bg-[linear-gradient(to_top,rgb(0_0_0/0.72),rgb(0_0_0/0.35)_55%,transparent)] px-6 pt-32 pb-16 transition-opacity duration-300${hidden}`
            : `grid h-full items-center justify-center gap-x-[clamp(48px,7vw,144px)] px-[clamp(24px,9vw,144px)] py-16 max-md:px-6 max-md:pb-18 ${
                column
                  ? 'grid-cols-[var(--art)_minmax(0,38vw)] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[minmax(0,1fr)_auto] max-md:items-stretch max-md:gap-y-4'
                  : 'grid-cols-[var(--art)]'
              }`
        }
        data-lyrics={column || undefined}
      >
        <section
          className={
            theater ? 'flex w-[min(720px,100%)] min-w-0 flex-col' : `flex w-(--art) min-w-0 flex-col${column ? ' max-md:order-2 max-md:w-full' : ''}`
          }
          aria-label="Player"
        >
          {/* FLIP artwork wrapper: morphs between miniplayer coordinates/size and full screen */}
          <div className="relative flex items-center justify-center">
            {/* Apple-style album artwork with rich 3D shadow */}
            <div
              ref={artworkMorphRef}
              className={`relative w-(--art) rounded-[18px] md:rounded-[22px] overflow-hidden shadow-[0_28px_70px_-12px_rgba(0,0,0,0.7),0_12px_28px_-8px_rgba(0,0,0,0.45)] will-change-transform motion-reduce:transition-none ${
                video && !squareVideoThumbnails ? 'aspect-video bg-black' : 'aspect-square'
              }${column ? ' max-md:hidden' : ''}${theater ? ' hidden' : ''}`}
            >
              {nowPlaying.artworkUrl && (
                <>
                  {/* Immediate cached mini-thumbnail for continuous, zero-delay flight */}
                  <img
                    key={`thumb-${nowPlaying.artworkUrl}`}
                    src={sizedArtwork(nowPlaying.artworkUrl, 34)}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    referrerPolicy="no-referrer"
                    aria-hidden="true"
                  />
                  {/* High-resolution cover art with smooth cross-fade */}
                  <img
                    key={nowPlaying.artworkUrl}
                    src={sizedArtwork(nowPlaying.artworkUrl, 600)}
                    alt=""
                    className="absolute inset-0 size-full object-cover transition-opacity duration-300"
                    referrerPolicy="no-referrer"
                  />
                </>
              )}
              {/* Subtle glass inner stroke */}
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0.5px_0_0.5px_rgba(255,255,255,0.22),inset_0_0_0_1px_rgba(0,0,0,0.15)]" />

              {/* Apple's motion artwork, over the cover once it's playing. */}
              {motion && (
                <MotionArtwork
                  key={motion.url}
                  motion={motion}
                  className="absolute inset-0 size-full rounded-[inherit] object-cover opacity-0 transition-opacity duration-600 ease-in data-ready:opacity-100"
                  playing={playing}
                />
              )}
              {video && !theater && <VideoSurface className="absolute inset-0" />}
            </div>
          </div>

          <div className="flex flex-col">
            <div className={`flex items-center gap-4${theater ? '' : ' mt-[clamp(20px,3.2vh,32px)]'}${column ? ' max-md:mt-0' : ''}`}>
              {/* Apple Music large bold title and artist */}
              <div ref={infoMorphRef} className="flex min-w-0 flex-1 flex-col gap-1 will-change-transform">
                <div className="flex min-w-0 items-center gap-2">
                  <PageLink
                    className={`min-w-0 max-w-full self-start truncate type-[700_22px/28px] md:type-[700_26px/32px] tracking-tight text-white drop-shadow-sm ${pageLink}`}
                    href={albumHref(album?.id ?? null)}
                    resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
                  >
                    {title}
                  </PageLink>
                  {track?.explicit && <ExplicitBadge size={15} />}
                </div>
                <span className="truncate type-[500_15px/20px] md:type-[500_17px/22px] text-white/70 tracking-normal">
                  {artist && <Credits videoId={videoId} line={artist} artists={track?.artists ?? []} className={pageLink} />}
                  {artist && album?.name && ' — '}
                  {album?.name && (
                    <PageLink
                      className={pageLink}
                      href={albumHref(album.id ?? null)}
                      resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
                    >
                      {album.name}
                    </PageLink>
                  )}
                </span>
                <NerdStats />
              </div>

              <div ref={titleActionsRef} className="flex items-center gap-2 will-change-transform">
                <FavoriteButton
                  videoId={nowPlaying.videoId}
                  className="grid size-9 flex-none place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white transition-all shadow-sm"
                  size={18}
                />
                {track && (
                  <TrackMenu
                    track={track}
                    className="grid size-9 flex-none place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white transition-all shadow-sm"
                    placement="above-end"
                  />
                )}
              </div>
            </div>

            <div ref={scrubberMorphRef} className="will-change-transform">
              <Scrubber />
            </div>

            <div ref={transportMorphRef} className="will-change-transform">
              <Transport />
            </div>

            <div ref={extraControlsRef} className="flex flex-col will-change-transform">
              <PlayerVolumeBar />
              <PlayerActionRow
                showLyrics={showLyrics}
                showQueue={showQueue}
                onToggleLyrics={() => togglePanel('lyrics')}
                onToggleQueue={() => togglePanel('queue')}
              />
            </div>
          </div>
        </section>

        {column && (
          <div ref={sideColumnRef} className="flex min-h-0 self-stretch will-change-transform">
            {showLyrics && (
              <section className="flex size-full min-h-0 animate-fade-in" aria-label="Lyrics">
                <LyricsPanel variant="full" />
              </section>
            )}
            {showQueue && (
              // Up Next in the right-hand column: the side panel's list, laid out as a column.
              <section
                className="flex size-full min-h-0 animate-fade-in flex-col [mask-image:linear-gradient(180deg,#000_calc(100%-80px),transparent)]"
                aria-label="Up Next"
              >
                <UpNext />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
