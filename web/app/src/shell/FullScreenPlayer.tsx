import { ChevronDown, ChevronRight, Maximize, Minimize, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
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
import { useLyrics } from '@/lyrics/useLyrics';
import { LyricClock } from '@/lyrics/clock';
import type { LyricLine } from '@/lyrics/model';
import { sizedArtwork } from '@/lib/artwork';
import { isDesktopApp } from '@/lib/platform';
import { useContentSettings } from '@/lib/contentSettings';
import { getAudio, getPlayhead, usePlayer } from '@/state/player';
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

/** A CSS media query as reactive state, so layout choices can drive FLIP morphs. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
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

/** The strip's intro and loading copy, the Android app's strings.xml word for word. */
const STRIP_INTRO_LINES = [
  'The beat is landing',
  'The song is starting',
  'Warming up',
  'Setting the mood',
  'Bass first, words later',
  'Wait for it',
  'Feel that build',
  'Just the groove for now',
  'The hook is on the way',
  'Let it breathe',
  'Cue the vocals',
  'First notes in',
];
const STRIP_LOADING_LINES = [
  'Getting the lyrics',
  'Finding the words',
  'Fetching the verses',
  'Lyrics are loading',
  'Checking the lyric sheet',
  'Searching the songbook',
  'Lining up the lyrics',
  'Words are on the way',
  'Checking the archives',
  'Finding the right words',
  'Lyrics are coming together',
  'Almost found the words',
];

// PlayerLyrics.kt's strip, as constants: the sung line reads white at 78 % and
// dims into its own end, the sweep's unsung words sit at 55 % under it,
// instrumentals and the intro at 50 %, and a line change slides both lines up
// over 340 ms.
const STRIP_SUNG_ALPHA = 0.78;
const STRIP_UNSUNG_ALPHA = 0.55;
const STRIP_MUTED_ALPHA = 0.5;
const STRIP_FADE_FRACTION = 0.28;
const STRIP_FADE_MIN_MS = 160;
const STRIP_FADE_MAX_MS = 700;
const STRIP_TRANSITION_MS = 340;
const STRIP_UNAVAILABLE_HOLD_MS = 5000;
const STRIP_UNAVAILABLE_FADE_MS = 900;

/** One moment of the strip: what is drawn, and what animates when it changes. */
interface StripEntry {
  kind: 'line' | 'intro' | 'instrumental' | 'unsynced' | 'loading' | 'unavailable';
  /** Animation identity: a change of key slides the old entry up and out. */
  key: string;
  text: string;
  /** The sung line itself, when the kind is 'line': words drive the sweep. */
  line?: LyricLine;
  /** The line's index in the sheet, for the dim's end. */
  index?: number;
  /** Whether the entry arrived over another one, and so slides in. */
  animated?: boolean;
  /** The dim the entry was last drawn at, baked in when it leaves. */
  alpha?: number;
  /** How far each word had been swept when the entry left. */
  wordModes?: ('before' | 'sweep' | 'after')[];
}

/** A copy line picked by the track, so the pick is stable for the track. */
function stripPick(catalog: string[], key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return catalog[Math.abs(hash) % catalog.length]!;
}

/** The beamed double note the strip raises during instrumentals (BeatFlowIcons.Instrumental). */
function InstrumentalNote({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M19.952 1.651a.75.75 0 0 1 .298.599V16.303a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.403-4.909l2.311-.66a1.5 1.5 0 0 0 1.088-1.442V6.994l-9 2.572v9.737a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.402-4.909l2.31-.66a1.5 1.5 0 0 0 1.088-1.442V5.25a.75.75 0 0 1 .544-.721l10.5-3a.75.75 0 0 1 .658.122Z"
      />
    </svg>
  );
}

/** "Lyrics not available": held a few seconds so it registers, then left to fade; the slot stays. */
function StripUnavailable({ trackKey }: { trackKey: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), STRIP_UNAVAILABLE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [trackKey]);
  return (
    <span
      className="truncate"
      style={{
        color: `rgba(255, 255, 255, ${STRIP_UNSUNG_ALPHA})`,
        opacity: visible ? 1 : 0,
        transition: `opacity ${STRIP_UNAVAILABLE_FADE_MS}ms linear`,
      }}
    >
      Lyrics not available
    </span>
  );
}

/** The animated text of one strip entry: the line or a stand-in, truncated to the strip. */
function StripEntryText({
  entry: e,
  mode,
  lineBoxRef,
  trackKey,
  reduceAnim,
}: {
  entry: StripEntry;
  mode: 'active' | 'out';
  lineBoxRef?: RefObject<HTMLSpanElement | null>;
  trackKey: string;
  reduceAnim: boolean;
}) {
  const words = e.kind === 'line' ? (e.line?.words ?? []) : [];
  // The dim bakes into the color rather than the opacity, so the leaving
  // entry's own fade reads as a continuation rather than a flash.
  const dim = e.alpha ?? STRIP_SUNG_ALPHA;
  const color =
    e.kind === 'line'
      ? `rgba(255, 255, 255, ${dim})`
      : e.kind === 'unsynced'
        ? 'rgba(255, 255, 255, 1)'
        : e.kind === 'intro' || e.kind === 'instrumental'
          ? `rgba(255, 255, 255, ${STRIP_MUTED_ALPHA})`
          : `rgba(255, 255, 255, ${STRIP_UNSUNG_ALPHA})`;
  const animation = reduceAnim ? '' : mode === 'out' ? 'animate-lyric-strip-out' : e.animated ? 'animate-lyric-strip-in' : '';
  const spanClass =
    mode === 'out'
      ? // The leaving line is not clipped to the arriving one's width; it
        // slides off at its own width, as the strip's SizeTransform allows.
        'absolute inset-y-0 left-0 flex w-max items-center whitespace-nowrap'
      : 'max-w-full truncate';

  return (
    <span
      ref={mode === 'active' ? lineBoxRef : undefined}
      data-entry={mode === 'active' ? e.key : undefined}
      className={`type-[500_16px/20px] ${spanClass} ${animation}`}
      style={words.length ? undefined : { color }}
    >
      {words.length
        ? words.map((w, i) => {
            // An arriving entry starts unsung; its first drawn frame is one
            // rAF away. A leaving one keeps the sweep as it stood, its sung
            // words at the baked dim, the rest at the unsung dim under it.
            const at =
              mode === 'active'
                ? STRIP_UNSUNG_ALPHA * STRIP_SUNG_ALPHA
                : (e.wordModes?.[i] ?? null) === 'after'
                  ? dim
                  : STRIP_UNSUNG_ALPHA * dim;
            return (
              <span key={i} data-word className="whitespace-pre" style={{ color: `rgba(255, 255, 255, ${at.toFixed(3)})` }}>
                {(i > 0 ? ' ' : '') + w.text}
              </span>
            );
          })
        : e.kind === 'unavailable' ? (
            <StripUnavailable trackKey={trackKey} />
          ) : (
            e.text
          )}
    </span>
  );
}

/**
 * The lyric strip (the Android app's CurrentLyricStrip): the line being sung,
 * one plain line of text directly above the scrubber, a tap opening the full
 * lyrics. The line slides up and out as the song moves, dims into its own end,
 * and word-synced lines sweep a karaoke boundary across themselves. Before the
 * first sung line and through instrumental breaks the strip raises the beamed
 * note; while the lookup runs it shows one of the loading lines, and a lookup
 * that came back empty shows "Lyrics not available" briefly, then fades.
 */
function LyricsPreview({ onOpen }: { onOpen: () => void }) {
  const lyrics = useLyrics();
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const isSynced = useMemo(() => lines.some((l) => l.timeMs > 0), [lines]);
  const mixing = usePlayer((s) => s.mixing);
  // Bumped whenever the audio element in front changes (crossfades swap decks);
  // the strip rebinds its clock and listeners with it, as the panel does.
  const deck = usePlayer((s) => s.deck);
  const trackKey = usePlayer((s) => s.nowPlaying?.videoId ?? '');
  const durationMs = usePlayer((s) => Math.round((s.nowPlaying?.durationSec ?? 0) * 1000));
  const reduceAnim = useMediaQuery('(prefers-reduced-motion: reduce)');
  // One copy line per track, the way Android remembers a pick for the track.
  const introLine = useMemo(() => stripPick(STRIP_INTRO_LINES, trackKey), [trackKey]);
  const loadingLine = useMemo(() => stripPick(STRIP_LOADING_LINES, trackKey), [trackKey]);

  const [entry, setEntry] = useState<StripEntry | null>(null);
  const [leaving, setLeaving] = useState<StripEntry | null>(null);
  const entryRef = useRef<StripEntry | null>(null);
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The frame loop draws through these: the active entry's line box and its
  // word spans, recollected whenever the entry they belong to changes.
  const lineBoxRef = useRef<HTMLSpanElement | null>(null);
  const wordEls = useRef<(HTMLSpanElement | null)[]>([]);
  const wordModes = useRef<('before' | 'sweep' | 'after' | null)[]>([]);
  const wordsStale = useRef(true);
  const alphaRef = useRef(STRIP_SUNG_ALPHA);
  // Boundary hysteresis, so a clock hovering over a line's start can't slide
  // the strip back and forth: a revert to the line just left is held off for
  // a moment, and a declared jump (a seek, a mix wrap) lifts the hold.
  const flapPrevKey = useRef('');
  const flapAt = useRef(0);
  const jumped = useRef(false);
  // Whether the previous render was in the synced world: entering it again
  // after a stands-in (or a track with none) means the remembered entry was
  // never on screen, so it must not slide out as if it had been.
  const wasSyncedRef = useRef(false);
  useEffect(() => {
    if (!isSynced) {
      wasSyncedRef.current = false;
      // Out of the synced world the stands-ins draw instead; drop the line
      // state so re-entering never flashes the old track's last line.
      setEntry(null);
      setLeaving(null);
    }
  }, [isSynced]);

  // The line at the steered clock's playhead: picked per frame, drawn per
  // frame, and re-rendered only when the line itself changes.
  useEffect(() => {
    if (!isSynced) return;
    const audio = getAudio();
    if (!audio) return;
    const clock = new LyricClock((mixing ? getPlayhead()?.sec ?? audio.currentTime : audio.currentTime) * 1000);
    const firstSung = lines.findIndex((l) => l.text.length !== 0);
    if (!wasSyncedRef.current) {
      // Fresh into the synced world: whatever the ref remembers was never
      // drawn here, so the first line arrives without an outgoing one.
      entryRef.current = null;
      wasSyncedRef.current = true;
    }
    let discontinuity = 0;
    let lastSec = audio.currentTime;
    let frame = 0;

    const advance = (next: StripEntry) => {
      const prev = entryRef.current;
      if (prev) {
        // The outgoing entry keeps the dim it was last drawn at, and how far
        // each of its words had been swept, so it slides off as it looked.
        setLeaving({ ...prev, alpha: alphaRef.current, wordModes: wordModes.current.slice() as ('before' | 'sweep' | 'after')[] });
        if (leavingTimer.current) clearTimeout(leavingTimer.current);
        leavingTimer.current = setTimeout(
          () => setLeaving((l) => (l && l.key === prev.key ? null : l)),
          reduceAnim ? 0 : STRIP_TRANSITION_MS,
        );
      }
      entryRef.current = next;
      wordsStale.current = true;
      setEntry({ ...next, animated: !!prev });
    };

    const collect = () => {
      const box = lineBoxRef.current;
      const ent = entryRef.current;
      // Not committed yet (the entry was advanced this same frame): leave the
      // flag up and retry on a later frame, or the sweep would die here.
      if (!box || ent?.kind !== 'line' || box.dataset.entry !== ent.key) return;
      const words = ent.line?.words ?? [];
      if (words.length) {
        wordEls.current = Array.from(box.querySelectorAll<HTMLSpanElement>('[data-word]'));
        wordModes.current = wordEls.current.map(() => null);
      } else {
        wordEls.current = [];
        wordModes.current = [];
      }
      wordsStale.current = false;
    };

    /** The line's own fade window: a fraction of its length, bounded. */
    const dimOf = (index: number, ms: number) => {
      const start = lines[index]?.timeMs ?? 0;
      const end = lines[index + 1]?.timeMs ?? (durationMs > start ? durationMs : start + 4000);
      const fade = Math.min(STRIP_FADE_MAX_MS, Math.max(STRIP_FADE_MIN_MS, (end - start) * STRIP_FADE_FRACTION));
      return STRIP_SUNG_ALPHA * Math.min(1, Math.max(0, (end - ms) / fade));
    };

    const draw = (ms: number) => {
      const ent = entryRef.current;
      const box = lineBoxRef.current;
      if (!ent || ent.kind !== 'line' || !ent.line || ent.index == null || !box) return;
      if (box.dataset.entry !== ent.key) {
        // The commit for this entry hasn't landed (it was advanced this same
        // frame); draw on a later frame, once its words have been collected.
        if (wordsStale.current) collect();
        return;
      }
      const alpha = dimOf(ent.index, ms);
      alphaRef.current = alpha;
      if (!ent.line.words.length) {
        box.style.color = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        return;
      }
      if (wordsStale.current) collect();
      const sung = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      const unsung = `rgba(255, 255, 255, ${(STRIP_UNSUNG_ALPHA * alpha).toFixed(3)})`;
      for (let i = 0; i < wordEls.current.length; i++) {
        const el = wordEls.current[i];
        const word = ent.line.words[i];
        if (!el || !word) continue;
        const mode = wordModes.current[i];
        if (word.endMs <= ms) {
          // Sung: a plain color. The alpha moves continuously, so the color
          // itself writes every frame; the resets write only on mode change.
          if (mode !== 'after') {
            wordModes.current[i] = 'after';
            el.style.backgroundImage = 'none';
            el.style.backgroundClip = '';
            el.style.setProperty('-webkit-background-clip', '');
          }
          el.style.color = sung;
        } else if (word.startMs <= ms) {
          // Being sung: the boundary crosses the word's own width, feathered
          // ahead of itself, the steady cut the panel's sweep draws.
          const f = Math.min(1, Math.max(0, (ms - word.startMs) / Math.max(1, word.endMs - word.startMs)));
          wordModes.current[i] = 'sweep';
          el.style.color = 'transparent';
          el.style.setProperty('-webkit-background-clip', 'text');
          el.style.backgroundClip = 'text';
          el.style.backgroundImage = `linear-gradient(90deg, ${sung} 0%, ${sung} ${(f * 100).toFixed(1)}%, ${unsung} ${Math.min(100, f * 100 + 12).toFixed(1)}%)`;
        } else if (mode !== 'before') {
          wordModes.current[i] = 'before';
          el.style.backgroundImage = 'none';
          el.style.backgroundClip = '';
          el.style.setProperty('-webkit-background-clip', '');
          el.style.color = unsung;
        } else {
          el.style.color = unsung;
        }
      }
    };

    const step = (ms: number) => {
      // The line at the playhead, as Android picks it: the last line begun.
      let index = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.timeMs > ms) break;
        index = i;
      }
      const current = index >= 0 ? (lines[index] ?? null) : null;
      const instrumental = current === null || current.text.length === 0;
      const intro = instrumental && firstSung >= 0 && index < firstSung;
      const kind = instrumental ? (intro ? 'intro' : 'instrumental') : 'line';
      const text = instrumental ? (intro ? introLine : 'Instrumental') : current!.text;
      const key = `${kind}#${index}#${text}`;
      if (entryRef.current?.key !== key) {
        const now = performance.now();
        if (!jumped.current && key === flapPrevKey.current && now - flapAt.current < 1500) {
          // A revert to the line just left, within the hold: ignore it.
        } else {
          flapPrevKey.current = entryRef.current?.key ?? '';
          flapAt.current = now;
          jumped.current = false;
          advance({ kind, key, text, line: current ?? undefined, index });
        }
      }
      draw(ms);
    };

    const tick = () => {
      const now = performance.now();
      if (mixing) {
        // A loop mix plays the song from a deck while its element sits paused:
        // follow the mix's playhead, which loops and moves at the ramped tempo.
        const sec = getPlayhead()?.sec ?? lastSec;
        if (sec < lastSec - 0.15 || sec > lastSec + 1) {
          discontinuity++;
          jumped.current = true;
        }
        lastSec = sec;
        step(clock.frame(now, Math.trunc(sec * 1000), now, discontinuity));
      } else {
        step(clock.frame(now, Math.trunc(audio.currentTime * 1000), now, discontinuity));
      }
      frame = requestAnimationFrame(tick);
    };

    if (mixing) {
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    const hold = () => {
      cancelAnimationFrame(frame);
      clock.hold(audio.currentTime * 1000, performance.now());
      // Draw once at the held reading, so a seek while paused lands at once.
      step(audio.currentTime * 1000);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      clock.restart();
      frame = requestAnimationFrame(tick);
    };
    const onSeeking = () => {
      discontinuity++;
      jumped.current = true;
      if (audio.paused) hold();
    };
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('seeked', onSeeking);
    audio.addEventListener('pause', hold);
    audio.addEventListener('play', resume);
    if (audio.paused) hold();
    else resume();
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('seeked', onSeeking);
      audio.removeEventListener('pause', hold);
      audio.removeEventListener('play', resume);
    };
  }, [isSynced, lines, mixing, deck, reduceAnim, introLine, durationMs]);

  // Without synced lines the strip shows its stands-in states straight from
  // the lookup, as Android swaps its branch without a transition.
  let derived: StripEntry | null = null;
  if (!isSynced) {
    if (lyrics.data === undefined) {
      if (lyrics.isError) derived = { kind: 'unavailable', key: 'unavailable', text: 'Lyrics not available' };
      else if (lyrics.fetchStatus === 'fetching') derived = { kind: 'loading', key: 'loading', text: loadingLine };
    } else if (lyrics.data === null || lines.length === 0) {
      derived = { kind: 'unavailable', key: 'unavailable', text: 'Lyrics not available' };
    } else {
      // Unsynced lyrics have no "now": the strip offers the way in instead.
      derived = { kind: 'unsynced', key: 'unsynced', text: 'Lyrics' };
    }
  }

  const active = isSynced ? entry : derived;
  const leavingShown = isSynced ? leaving : null;
  const note = active?.kind === 'intro' || active?.kind === 'instrumental' || active?.kind === 'unsynced';

  return (
    // The slot holds its height whatever the strip shows, so a track change
    // never reflows the names above or the scrubber below. Nudged down into
    // the scrubber's dead space, as the Android strip is, only a touch lower.
    <div className="h-8 translate-y-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open lyrics"
        className="flex h-full w-full min-w-0 cursor-pointer items-center rounded-lg text-left"
      >
        {note && <InstrumentalNote className="size-4 shrink-0 text-white" />}
        {note && <span className="w-1.5 shrink-0" />}
        <span className="relative min-w-0">
          {leavingShown && (
            <StripEntryText
              key={`out-${leavingShown.key}`}
              entry={leavingShown}
              mode="out"
              trackKey={trackKey}
              reduceAnim={reduceAnim}
            />
          )}
          {active && (
            <StripEntryText
              key={active.key}
              entry={active}
              mode="active"
              lineBoxRef={lineBoxRef}
              trackKey={trackKey}
              reduceAnim={reduceAnim}
            />
          )}
        </span>
        {active && (
          <>
            <span className="w-1.5 shrink-0" />
            <ChevronRight size={14} className="shrink-0 text-white/50" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}

// Close, browser full screen, the column toggles and the speaker, in the corners.
const chromeButton =
  'grid size-8 place-items-center rounded-full text-secondary transition-[background-color,color] duration-100 ease-in hover:bg-quinary hover:text-primary';
const chrome = `absolute z-1 ${chromeButton}`;

/** How long the pointer can rest before a playing music video hides its controls. */
const IDLE_MS = 3000;

/**
 * Apple's sheet curve, shared by the expand and the collapse morphs: the pill
 * and the full player then read as one sheet travelling both ways.
 */
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** How many frames the expand may wait for a measurable miniplayer before giving up. */
const EXPAND_MAX_RETRIES = 12;

export interface FullScreenPlayerProps {
  open?: boolean;
  onDismissed?: () => void;
}

/** Live geometry of the panel pause/resume morph's moving blocks; null when not rendered or display:none. */
interface PanelRects {
  art: DOMRect | null;
  info: DOMRect | null;
  controls: DOMRect | null;
  stats: DOMRect | null;
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
  // Tailwind's md breakpoint: wide enough for the names/controls to stand beside the artwork.
  const wide = useMediaQuery('(min-width: 768px)');
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
  // The lyric preview's wrapper, faded out with the secondary controls on collapse.
  const previewRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<'initial' | 'expanding' | 'expanded' | 'collapsing' | 'collapsed'>('initial');
  const activeAnims = useRef<Animation[]>([]);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The pill-restoring handoff of a collapse; cleared when a re-expand takes over.
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The expand's settle timeout and its "miniplayer not measurable yet" retry frame.
  const expandSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandRetryFrame = useRef(0);
  const onDismissedRef = useRef(onDismissed);

  // Panel pause/resume morph: the names+actions row and the scrubber/transport
  // stack swap between the artwork column and the screen's right half, FLIP-animated.
  const panelInfoRef = useRef<HTMLDivElement>(null);
  const panelControlsRef = useRef<HTMLDivElement>(null);
  const panelStatsRef = useRef<HTMLDivElement>(null);
  const panelFromRects = useRef<PanelRects | null>(null);
  const panelFlipPending = useRef(false);

  useEffect(() => {
    onDismissedRef.current = onDismissed;
  }, [onDismissed]);

  const capturePanelRects = useCallback((): PanelRects => {
    const rect = (ref: { current: HTMLElement | null }): DOMRect | null => {
      const el = ref.current;
      // display:none (the artwork on a narrow lyrics layout) has no boxes.
      return el && el.getClientRects().length > 0 ? el.getBoundingClientRect() : null;
    };
    return {
      art: rect(artworkMorphRef),
      info: rect(panelInfoRef),
      controls: rect(panelControlsRef),
      stats: rect(panelStatsRef),
    };
  }, []);

  /**
   * Snapshot the panel blocks' live geometry just before a toggle re-renders,
   * so the morph can fly them from their old home to the new one. A flip
   * still in flight holds transforms; release them first so the snapshot
   * reads the true layout. Nothing paints in between: capture, state flip
   * and re-render all happen inside this one task.
   */
  const beginPanelFlip = useCallback(() => {
    if (phaseRef.current !== 'expanded' || !wide) return;
    activeAnims.current.forEach((a) => {
      try { a.cancel(); } catch { /* ignore */ }
    });
    activeAnims.current = [];
    panelFromRects.current = capturePanelRects();
    panelFlipPending.current = true;
  }, [capturePanelRects, wide]);

  // The column follows the toggle alone: whether this track has lyrics, and
  // from which provider, is the panel's own business to say.
  const showLyrics = panel === 'lyrics';
  const showQueue = panel === 'queue';
  const togglePanel = (p: 'lyrics' | 'queue') => {
    beginPanelFlip();
    picked.current = true;
    setPanel((on) => (on === p ? null : p));
  };

  useEffect(() => {
    if (video && !picked.current) {
      beginPanelFlip();
      setPanel(null);
    }
  }, [video, beginPanelFlip]);

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

    const miniPillEl = document.getElementById('miniplayer-pill');
    const miniArtEl = document.getElementById('miniplayer-artwork');
    const miniInfoEl = document.getElementById('miniplayer-info');
    const miniTransEl = document.getElementById('miniplayer-transport');
    const miniScrubEl = document.getElementById('miniplayer-scrubber');

    const pillRect = miniPillEl?.getBoundingClientRect();
    const validPill = pillRect && pillRect.width > 0 && pillRect.height > 0;

    const pill = validPill
      ? pillRect
      : new DOMRect(
          Math.max(16, (vw - Math.min(668, vw - 32)) / 2),
          vh - 76,
          Math.min(668, vw - 32),
          56,
        );

    const art = miniArtEl && miniArtEl.getBoundingClientRect().width > 0
      ? miniArtEl.getBoundingClientRect()
      : new DOMRect(pill.left + 200, pill.top + 11, 34, 34);

    const info = miniInfoEl && miniInfoEl.getBoundingClientRect().width > 0
      ? miniInfoEl.getBoundingClientRect()
      : new DOMRect(pill.left + 242, pill.top + 11, Math.min(240, pill.width - 390), 34);

    const trans = miniTransEl && miniTransEl.getBoundingClientRect().width > 0
      ? miniTransEl.getBoundingClientRect()
      : new DOMRect(pill.left + 16, pill.top + 8, 170, 40);

    const scrub = miniScrubEl && miniScrubEl.getBoundingClientRect().width > 0
      ? miniScrubEl.getBoundingClientRect()
      : new DOMRect(pill.left + 200, pill.bottom - 8, Math.min(280, pill.width - 340), 4);

    return { pill, art, info, trans, scrub };
  };

  // Drop the expand's pending settle timeout and retry frame, if any.
  const clearExpandTimers = useCallback(() => {
    if (expandSettleTimer.current) {
      clearTimeout(expandSettleTimer.current);
      expandSettleTimer.current = null;
    }
    if (expandRetryFrame.current) {
      cancelAnimationFrame(expandRetryFrame.current);
      expandRetryFrame.current = 0;
    }
  }, []);

  // Drop a collapse's pending pill handoff and unmount, if any.
  const clearCollapseTimers = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    if (handoffTimer.current) {
      clearTimeout(handoffTimer.current);
      handoffTimer.current = null;
    }
  }, []);

  /**
   * The Apple matched-geometry FLIP expansion: the pill's card, thumbnail,
   * names, transport and seek line fly from the miniplayer's live coordinates
   * into the full player, via the Web Animations API. Runs on mount, and
   * whenever the player re-opens while still mounted (the thumbnail clicked
   * while a collapse is still finishing), so the thumbnail always flies the
   * way it does on the way down. If the miniplayer cannot be measured yet —
   * the first layout may still be settling, notably in the desktop's webview —
   * it retries over the next frames instead of silently skipping the morph.
   */
  const runExpand = useCallback((attempt = 0) => {
    const cardBgEl = cardBgRef.current;
    const artEl = artworkMorphRef.current;
    const infoEl = infoMorphRef.current;
    const transEl = transportMorphRef.current;
    const scrubEl = scrubberMorphRef.current;
    const sheetEl = sheetRef.current;

    if (!cardBgEl || !artEl || !infoEl || !transEl || !scrubEl || !sheetEl) {
      // Not laid out yet: try the next frame rather than losing the morph.
      if (attempt < EXPAND_MAX_RETRIES) {
        expandRetryFrame.current = requestAnimationFrame(() => runExpand(attempt + 1));
      }
      return;
    }

    // Start from a clean slate: a re-open mid-collapse (or a StrictMode
    // remount) leaves fill-both animations and inline transforms behind, and
    // those would corrupt both the measurement and the frame-0 positioning.
    activeAnims.current.forEach((a) => {
      try { a.cancel(); } catch { /* ignore */ }
    });
    activeAnims.current = [];
    clearExpandTimers();
    clearCollapseTimers();
    sheetEl.style.transition = '';
    cardBgEl.style.transform = '';
    cardBgEl.style.borderRadius = '';
    artEl.style.transform = '';
    artEl.style.borderRadius = '';
    infoEl.style.transform = '';
    transEl.style.transform = '';
    scrubEl.style.transform = '';

    const { pill: miniPill, art: miniArt, info: miniInfo, trans: miniTrans, scrub: miniScrub } = getMiniCoords();

    if (miniPill.width <= 0 || miniPill.height <= 0) {
      // The pill is not measurable yet: retry over the next frames.
      if (attempt < EXPAND_MAX_RETRIES) {
        expandRetryFrame.current = requestAnimationFrame(() => runExpand(attempt + 1));
      }
      return;
    }

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

    // 2. Calculate deltas for Artwork (center-to-center for rock-solid scaling alignment)
    const fullArtCenterX = fullArt.left + fullArt.width / 2;
    const fullArtCenterY = fullArt.top + fullArt.height / 2;
    const miniArtCenterX = miniArt.left + miniArt.width / 2;
    const miniArtCenterY = miniArt.top + miniArt.height / 2;
    const artDx = miniArtCenterX - fullArtCenterX;
    const dyArt = miniArtCenterY - fullArtCenterY;
    const artScale = Math.max(0.01, miniArt.width / Math.max(1, fullArt.width));
    const artRadius = 6 / artScale;

    // 3. Calculate deltas for Title & Artist
    const infoDx = miniInfo.left - fullInfo.left;
    const dyInfo = miniInfo.top - fullInfo.top;
    const infoScale = Math.min(1, Math.max(0.45, miniInfo.height / Math.max(1, fullInfo.height)));

    // 4. Calculate deltas for Transport Controls
    const transDx = (miniTrans.left + miniTrans.width / 2) - (fullTrans.left + fullTrans.width / 2);
    const dyTrans = (miniTrans.top + miniTrans.height / 2) - (fullTrans.top + fullTrans.height / 2);
    const transScale = Math.min(1, Math.max(0.35, miniTrans.width / Math.max(1, fullTrans.width)));

    // 5. Calculate deltas for Scrubber
    const scrubDx = miniScrub.left - fullScrub.left;
    const dyScrub = miniScrub.top - fullScrub.top;
    const scrubScaleX = Math.max(0.01, miniScrub.width / fullScrub.width);

    // Synchronously set initial transforms before first browser paint so no frame-0 flash occurs
    cardBgEl.style.transformOrigin = '0 0';
    cardBgEl.style.overflow = 'hidden';
    cardBgEl.style.transform = `translate3d(${cardDx}px, ${cardDy}px, 0) scale(${cardScaleX}, ${cardScaleY})`;
    cardBgEl.style.borderRadius = `${rx}px / ${ry}px`;

    artEl.style.transformOrigin = 'center center';
    artEl.style.transform = `translate3d(${artDx}px, ${dyArt}px, 0) scale(${artScale})`;
    artEl.style.borderRadius = `${artRadius}px`;

    infoEl.style.transformOrigin = '0 0';
    infoEl.style.transform = `translate3d(${infoDx}px, ${dyInfo}px, 0) scale(${infoScale})`;

    transEl.style.transformOrigin = 'center center';
    transEl.style.transform = `translate3d(${transDx}px, ${dyTrans}px, 0) scale(${transScale})`;

    scrubEl.style.transformOrigin = '0 0';
    scrubEl.style.transform = `translate3d(${scrubDx}px, ${dyScrub}px, 0) scale(${scrubScaleX}, 0.5)`;

    phaseRef.current = 'expanding';

    // Trigger Play Animation (t=1): the shared Apple sheet curve, both directions
    const animOpts = { duration: 620, easing: SHEET_EASE, fill: 'both' as FillMode };

    activeAnims.current.push(
      cardBgEl.animate(
        [
          {
            transform: `translate3d(${cardDx}px, ${cardDy}px, 0) scale(${cardScaleX}, ${cardScaleY})`,
            borderRadius: `${rx}px / ${ry}px`,
          },
          {
            transform: 'translate3d(0, 0, 0) scale(1, 1)',
            borderRadius: '0px',
          },
        ],
        animOpts
      ),
      artEl.animate(
        [
          {
            transform: `translate3d(${artDx}px, ${dyArt}px, 0) scale(${artScale})`,
            borderRadius: `${artRadius}px`,
            transformOrigin: 'center center',
          },
          {
            transform: 'translate3d(0, 0, 0) scale(1)',
            borderRadius: '22px',
            transformOrigin: 'center center',
          },
        ],
        animOpts
      ),
      infoEl.animate(
        [
          { transform: `translate3d(${infoDx}px, ${dyInfo}px, 0) scale(${infoScale})` },
          { transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        animOpts
      ),
      transEl.animate(
        [
          { transform: `translate3d(${transDx}px, ${dyTrans}px, 0) scale(${transScale})` },
          { transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        animOpts
      ),
      scrubEl.animate(
        [
          { transform: `translate3d(${scrubDx}px, ${dyScrub}px, 0) scale(${scrubScaleX}, 0.5)` },
          { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
        ],
        animOpts
      )
    );

    if (headerRef.current) {
      activeAnims.current.push(
        headerRef.current.animate(
          [
            { transform: 'translate3d(0, -20px, 0)', opacity: 0 },
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          ],
          { duration: 480, delay: 80, easing: SHEET_EASE, fill: 'both' }
        )
      );
    }

    if (extraControlsRef.current) {
      activeAnims.current.push(
        extraControlsRef.current.animate(
          [
            { transform: 'translate3d(0, 24px, 0)', opacity: 0 },
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          ],
          { duration: 540, delay: 100, easing: SHEET_EASE, fill: 'both' }
        )
      );
    }

    if (titleActionsRef.current) {
      activeAnims.current.push(
        titleActionsRef.current.animate(
          [
            { transform: 'translate3d(0, 14px, 0)', opacity: 0 },
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          ],
          { duration: 500, delay: 80, easing: SHEET_EASE, fill: 'both' }
        )
      );
    }

    if (sideColumnRef.current) {
      activeAnims.current.push(
        sideColumnRef.current.animate(
          [
            { transform: 'translate3d(24px, 0, 0)', opacity: 0 },
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          ],
          { duration: 520, delay: 100, easing: SHEET_EASE, fill: 'both' }
        )
      );
    }

    expandSettleTimer.current = setTimeout(() => {
      phaseRef.current = 'expanded';
      expandSettleTimer.current = null;
      // Reset inline transforms so responsive CSS layout takes over cleanly
      artEl.style.transform = '';
      artEl.style.borderRadius = '';
      cardBgEl.style.transform = '';
      cardBgEl.style.borderRadius = '';
      infoEl.style.transform = '';
      transEl.style.transform = '';
      scrubEl.style.transform = '';
    }, 640);
  }, [clearCollapseTimers, clearExpandTimers]);

  // The expansion plays when the player mounts up from the miniplayer pill.
  useLayoutEffect(() => {
    runExpand();
    return clearExpandTimers;
  }, [runExpand, clearExpandTimers]);

  /**
   * The panel pause/resume morph: the names+actions row and the scrubber,
   * transport, volume and action stack trade the screen's right half for the
   * spot under the artwork — opening lyrics or Up Next tucks them back under
   * it, closing them sends them out to the right again — flying along
   * FLIP-measured transforms so the whole cluster reads as one continuously
   * moving sheet, both ways.
   */
  const runPanelFlip = useCallback(() => {
    if (phaseRef.current !== 'expanded') return;
    const from = panelFromRects.current;
    panelFromRects.current = null;
    if (!from) return;

    // Release transforms held over from a previous flip before measuring.
    activeAnims.current.forEach((a) => {
      try { a.cancel(); } catch { /* ignore */ }
    });
    activeAnims.current = [];

    const to = capturePanelRects();
    const pairs: Array<[HTMLElement | null, DOMRect | null, DOMRect | null, number]> = [
      [artworkMorphRef.current, from.art, to.art, 0],
      [panelInfoRef.current, from.info, to.info, 30],
      [panelControlsRef.current, from.controls, to.controls, 60],
      [panelStatsRef.current, from.stats, to.stats, 60],
    ];

    const opts = { duration: 480, easing: SHEET_EASE, fill: 'both' as FillMode };
    for (const [el, a, b, delay] of pairs) {
      if (!el || !a || !b) continue;
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      const sx = a.width / Math.max(1, b.width);
      const sy = a.height / Math.max(1, b.height);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
      activeAnims.current.push(
        el.animate(
          [
            { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, transformOrigin: 'center center' },
            { transform: 'translate3d(0, 0, 0) scale(1, 1)', transformOrigin: 'center center' },
          ],
          { ...opts, delay }
        )
      );
    }
  }, [capturePanelRects]);

  // A toggle's re-render has placed the blocks in their new home: fly them in.
  useLayoutEffect(() => {
    if (!panelFlipPending.current) return;
    panelFlipPending.current = false;
    runPanelFlip();
  });

  // Collapse / Minimize Animation with Symmetrical Apple Return
  const startCollapse = useCallback(() => {
    if (phaseRef.current === 'collapsing' || phaseRef.current === 'collapsed') return;
    phaseRef.current = 'collapsing';

    // A collapse started mid-expand must not inherit the expand's settle timer
    // (which would clear the flight's inline styles under the collapse) or its
    // pending retry frames.
    clearExpandTimers();
    const cardBgEl = cardBgRef.current;
    const artEl = artworkMorphRef.current;
    const infoEl = infoMorphRef.current;
    const transEl = transportMorphRef.current;
    const scrubEl = scrubberMorphRef.current;
    const extraEl = extraControlsRef.current;
    const actionsEl = titleActionsRef.current;
    const headerEl = headerRef.current;
    const sideEl = sideColumnRef.current;
    const previewEl = previewRef.current;
    const sheetEl = sheetRef.current;

    // Cancel any active expand animations
    activeAnims.current.forEach((a) => {
      try { a.cancel(); } catch { /* ignore */ }
    });
    activeAnims.current = [];

    const collapseEase = SHEET_EASE;

    // Measure LIVE coordinates of miniplayer elements for pixel-perfect retrieval
    const { pill: livePill, art: liveArt, info: liveInfo, trans: liveTrans, scrub: liveScrub } = getMiniCoords();

    // A drag release leaves the sheet translated/scaled by the gesture. The
    // morph targets are computed in the sheet's own untransformed layout
    // space — the card and its children are laid out there — so neutralize
    // the drag transform while measuring. It is restored right after and
    // handed to the sheet spring below; all of this happens in this one
    // task, so no intermediate frame paints and nothing on screen jumps.
    const dragTransform = sheetEl ? sheetEl.style.transform : '';
    if (sheetEl && dragTransform) {
      sheetEl.style.transition = 'none';
      sheetEl.style.transform = '';
    }

    const sheetRect = sheetEl ? sheetEl.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const fullWidth = sheetRect.width || window.innerWidth;
    const fullHeight = sheetRect.height || window.innerHeight;

    const fullArt = artEl?.getBoundingClientRect();
    const fullInfo = infoEl?.getBoundingClientRect();
    const fullTrans = transEl?.getBoundingClientRect();
    const fullScrub = scrubEl?.getBoundingClientRect();

    if (sheetEl && dragTransform) {
      // Give the gesture back before the spring reads it, so the recede runs
      // from exactly where the pointer left the sheet.
      sheetEl.style.transition = 'none';
      sheetEl.style.transform = dragTransform;
    }

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

    const collapseOpts = { duration: 500, easing: collapseEase, fill: 'both' as FillMode };

    if (cardBgEl) {
      cardBgEl.style.transformOrigin = '0 0';
      activeAnims.current.push(
        cardBgEl.animate(
          [
            {
              transform: 'translate3d(0, 0, 0) scale(1, 1)',
              borderRadius: '0px',
            },
            {
              transform: `translate3d(${cardDx}px, ${cardDy}px, 0) scale(${cardScaleX}, ${cardScaleY})`,
              borderRadius: `${rx}px / ${ry}px`,
            },
          ],
          collapseOpts
        )
      );

      // The ambient dissolves into the page as the card lands: the page's own
      // colour takes over gradually underneath the pill's glass, instead of
      // snapping in the frame the sheet unmounts. Linear reads smoothest for
      // a pure colour crossfade.
      activeAnims.current.push(
        cardBgEl.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 360,
          delay: 240,
          easing: 'linear',
          fill: 'both',
        })
      );
    }

    if (artEl && fullArt) {
      const liveArtCenterX = liveArt.left + liveArt.width / 2;
      const liveArtCenterY = liveArt.top + liveArt.height / 2;
      const fullArtCenterX = fullArt.left + fullArt.width / 2;
      const fullArtCenterY = fullArt.top + fullArt.height / 2;
      const artDx = liveArtCenterX - fullArtCenterX;
      const dyArt = liveArtCenterY - fullArtCenterY;
      const artScale = Math.max(0.01, liveArt.width / Math.max(1, fullArt.width));
      const artRadius = 6 / artScale;

      artEl.style.transformOrigin = 'center center';
      activeAnims.current.push(
        artEl.animate(
          [
            {
              transform: 'translate3d(0, 0, 0) scale(1)',
              borderRadius: '22px',
              transformOrigin: 'center center',
            },
            {
              transform: `translate3d(${artDx}px, ${dyArt}px, 0) scale(${artScale})`,
              borderRadius: `${artRadius}px`,
              transformOrigin: 'center center',
            },
          ],
          collapseOpts
        )
      );
    }

    if (infoEl && fullInfo) {
      const infoDx = liveInfo.left - fullInfo.left;
      const dyInfo = liveInfo.top - fullInfo.top;
      const infoScale = Math.min(1, Math.max(0.45, liveInfo.height / Math.max(1, fullInfo.height)));

      infoEl.style.transformOrigin = '0 0';
      activeAnims.current.push(
        infoEl.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1)' },
            { transform: `translate3d(${infoDx}px, ${dyInfo}px, 0) scale(${infoScale})` },
          ],
          { duration: 480, easing: collapseEase, fill: 'both' }
        )
      );
    }

    if (transEl && fullTrans) {
      const transDx = (liveTrans.left + liveTrans.width / 2) - (fullTrans.left + fullTrans.width / 2);
      const dyTrans = (liveTrans.top + liveTrans.height / 2) - (fullTrans.top + fullTrans.height / 2);
      const transScale = Math.min(1, Math.max(0.35, liveTrans.width / Math.max(1, fullTrans.width)));

      transEl.style.transformOrigin = 'center center';
      activeAnims.current.push(
        transEl.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1)' },
            { transform: `translate3d(${transDx}px, ${dyTrans}px, 0) scale(${transScale})` },
          ],
          { duration: 480, easing: collapseEase, fill: 'both' }
        )
      );
    }

    if (scrubEl && fullScrub) {
      const scrubDx = liveScrub.left - fullScrub.left;
      const dyScrub = liveScrub.top - fullScrub.top;
      const scrubScaleX = Math.max(0.01, liveScrub.width / Math.max(1, fullScrub.width));

      scrubEl.style.transformOrigin = '0 0';
      activeAnims.current.push(
        scrubEl.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
            { transform: `translate3d(${scrubDx}px, ${dyScrub}px, 0) scale(${scrubScaleX}, 0.5)` },
          ],
          { duration: 480, easing: collapseEase, fill: 'both' }
        )
      );
    }

    // The landed content hands off to the pill's own copies, fading out in
    // step with the pill's fade-in (its handoff starts at 420ms). The two
    // crossfade — the artwork pixel-for-pixel — instead of the sheet's copies
    // vanishing at unmount while the pill is still arriving.
    const handoffFade = { duration: 160, delay: 420, easing: 'ease-out', fill: 'both' as FillMode };
    for (const morphEl of [artEl, infoEl, transEl, scrubEl]) {
      if (morphEl) {
        activeAnims.current.push(morphEl.animate([{ opacity: 1 }, { opacity: 0 }], handoffFade));
      }
    }

    // Secondary controls fade out gracefully
    if (extraEl) {
      activeAnims.current.push(
        extraEl.animate(
          [
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            { transform: 'translate3d(0, 16px, 0)', opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out', fill: 'both' }
        )
      );
    }

    if (previewEl) {
      activeAnims.current.push(
        previewEl.animate(
          [
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            { transform: 'translate3d(0, 16px, 0)', opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out', fill: 'both' }
        )
      );
    }

    if (actionsEl) {
      activeAnims.current.push(
        actionsEl.animate(
          [
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            { transform: 'translate3d(0, 14px, 0)', opacity: 0 },
          ],
          { duration: 160, easing: 'ease-out', fill: 'both' }
        )
      );
    }

    if (headerEl) {
      activeAnims.current.push(
        headerEl.animate(
          [
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            { transform: 'translate3d(0, -20px, 0)', opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out', fill: 'both' }
        )
      );
    }

    if (sideEl) {
      activeAnims.current.push(
        sideEl.animate(
          [
            { opacity: 1 },
            { opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out', fill: 'both' }
        )
      );
    }

    // Seamless handoff: return PlayerBar visibility as collapse finishes landing
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    handoffTimer.current = setTimeout(() => {
      handoffTimer.current = null;
      setFullScreen(false);
    }, 420);

    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    // Unmount after the dissolve finishes, never during it: the ambient is
    // gone by 600ms and the pill's own fade-in lands by 620ms, so removal at
    // 640ms takes nothing visible away.
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      if (handoffTimer.current) clearTimeout(handoffTimer.current);
      handoffTimer.current = null;
      setFullScreen(false);
      phaseRef.current = 'collapsed';
      onDismissedRef.current?.();
    }, 640);
  }, [setFullScreen, clearExpandTimers]);

  // Synchronize when open prop changes. A layout effect, so a re-expand's
  // frame-0 positioning lands before the browser paints (no full-size flash).
  useLayoutEffect(() => {
    if (open) {
      // Re-opened while still mounted — the thumbnail clicked while a collapse
      // was still finishing: cancel the pending dismissal and fly back up,
      // instead of letting the collapse snap the player shut un-animated.
      if (phaseRef.current === 'collapsing' || phaseRef.current === 'collapsed') {
        clearCollapseTimers();
        runExpand();
      }
      return;
    }
    if (phaseRef.current === 'expanded' || phaseRef.current === 'expanding') {
      startCollapse();
    }
  }, [open, runExpand, startCollapse, clearCollapseTimers]);

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
  // While both panels are paused on a wide window, the names and controls stand
  // in the right half beside the artwork; lyrics or Up Next claims that half
  // back and tucks them under the artwork again.
  const shifted = !column && !video && wide;
  // ...and hides the controls and the pointer while it plays undisturbed.
  const hidden = theater && playing && idle ? ' pointer-events-none opacity-0' : '';
  const corner = `${chrome} transition-[background-color,color,opacity] duration-300${hidden}`;

  /**
   * The names + actions row, with two homes: under the artwork while a panel
   * is open (and by default on narrow windows), in the right half while the
   * panels are paused. One element, one ref — the toggle re-parents it and
   * the FLIP carries it across, so it reads as the same block travelling,
   * not two swapping.
   */
  const panelInfo = (
    <div
      ref={panelInfoRef}
      className={
        shifted || theater
          ? 'flex items-center gap-4 will-change-transform'
          : `flex items-center gap-4 will-change-transform mt-[clamp(20px,3.2vh,32px)]${column ? ' max-md:mt-0' : ''}`
      }
    >
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
        {/* When shifted the stats stay under the artwork instead. */}
        {!shifted && <NerdStats />}
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
  );

  /** The scrubber, transport, volume and the panel toggles — the foot of the cluster, with the lyric preview on its head. */
  const panelControls = (
    <div ref={panelControlsRef} className="flex flex-col will-change-transform">
      {/* The Android app's lyric preview: under the names, above the seek line,
          while no panel is open and no video fills the window. */}
      {!column && !video && (
        <div ref={previewRef}>
          <LyricsPreview onOpen={() => togglePanel('lyrics')} />
        </div>
      )}
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
  );

  /** The lyrics or Up Next, as the right column's own content. */
  const panelContent = (
    <>
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
    </>
  );

  return (
    <div
      ref={sheetRef}
      // Over everything but menus and dialogs, which portal above it. Pure GPU compositor layer for 120 FPS.
      className={`fixed inset-0 z-[calc(var(--z-contextual-menus)-2)] isolate overflow-hidden text-primary will-change-transform motion-reduce:transition-none ${
        shifted
          ? // With the panels paused the artwork has the left half to itself, so
            // it earns a little more room; the FLIP blooms it bigger and lower.
            '[--art:min(38vw,calc(100dvh-240px),560px)]'
          : column || video
            ? '[--art:min(35vw,calc(100dvh-310px),520px)] max-md:[--art:min(86vw,calc(100dvh-340px),420px)]'
            // With the panels paused the lyric strip joins the column (narrow
            // windows): its fixed 32px slot comes out of the artwork's budget.
            : '[--art:min(35vw,calc(100dvh-310px),520px)] max-md:[--art:min(86vw,calc(100dvh-380px),420px)]'
      }`}
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

      {/* Top Header Row (minimize chevron, video quality & full screen) */}
      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-center justify-between px-6 pt-3 pb-2 will-change-transform [&_button]:pointer-events-auto"
      >
        <button
          ref={close}
          className="relative z-1 grid size-9 place-items-center text-white/70 hover:text-white active:scale-90 transition-[color,transform] duration-150"
          aria-label="Minimize"
          onClick={startCollapse}
        >
          <ChevronDown size={26} strokeWidth={2.4} />
        </button>

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
                  : shifted
                    ? 'grid-cols-[var(--art)_minmax(0,38vw)]'
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

          {/* With the panels paused, the stats stay behind under the artwork on their own. */}
          {shifted && (
            <div ref={panelStatsRef} className="mt-4 w-full min-w-0 animate-fade-in empty:hidden will-change-transform">
              <NerdStats />
            </div>
          )}

          {/* The names + actions and the controls: beside the artwork while the
              panels are paused, under it once lyrics or Up Next is open. */}
          {!shifted && panelInfo}
          {!shifted && panelControls}
        </section>

        {column && (
          <div ref={sideColumnRef} className="flex min-h-0 self-stretch will-change-transform">
            {panelContent}
          </div>
        )}

        {/* The panels' paused home: the names + controls stand in the right half. */}
        {shifted && (
          <div ref={sideColumnRef} className="flex min-h-0 flex-col justify-center self-stretch will-change-transform">
            {panelInfo}
            {panelControls}
          </div>
        )}
      </div>
    </div>
  );
}
