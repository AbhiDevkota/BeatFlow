// Registers <am-lyrics>.
import '@uimaxbai/am-lyrics/am-lyrics.js';
import { Check, ChevronLeft, ChevronRight, ListMusic, Minus, MoreHorizontal, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BeatLoader } from '@/components/music/BeatLoader';
import { useCanvas } from '@/data/spotify/canvas';
import { getBridge } from '@/extension/bridge';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/Menu';
import { LyricClock } from '@/lyrics/clock';
import { onUngrantedChange, ungrantedOrigins } from '@/lyrics/http';
import type { SourceState } from '@/lyrics/repository';
import { enabledSources } from '@/lyrics/settings';
import { sourceById, type LyricsSourceId } from '@/lyrics/sources';
import { useLyrics, useLyricsUi } from '@/lyrics/useLyrics';
import { getAudio, getPlayhead, usePlayer } from '@/state/player';
import { LyricsSettings } from './LyricsSettings';

type AmLyricsElement = HTMLElement & {
  currentTime: number;
  ttml?: string;
  interpolate: boolean;
  autoScroll: boolean;
  highlightColor: string;
  fontFamily?: string;
  updateComplete?: Promise<unknown>;
};

/**
 * am-lyrics' own footer offers to fetch from its own providers; ours decide
 * (prompt §10.2). It stays in the layout, only unseen: am-lyrics measures its
 * scroll range to the footer, and `display: none` collapsed that range to zero,
 * so the lyrics never scrolled.
 */
const HIDE_FOOTER = '.lyrics-footer { visibility: hidden !important; pointer-events: none !important; }';

/** The phone's lyric typeface (@font-face in styles/global.css), then the app's. */
const LYRIC_FONT = "'BeatFlow SF Pro Display', 'DM Sans', system-ui, sans-serif";

let lyricFont: Promise<void> | null = null;
let lyricFontLoaded = false;

/**
 * Both weights, fetched once. am-lyrics measures its lines for the scroll and
 * the wipe, so it's only built once the face is in: built earlier, it laid
 * out in the fallback and then jumped when the font arrived. A slow network
 * gives up after 1.5 s and lets the fallback show.
 */
function loadLyricFont(): Promise<void> {
  lyricFont ??= Promise.race([
    Promise.all([document.fonts.load(`700 28px ${LYRIC_FONT}`), document.fonts.load(`400 28px ${LYRIC_FONT}`)]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ])
    .catch(() => undefined)
    .then(() => {
      lyricFontLoaded = true;
    });
  return lyricFont;
}

function useLyricFont(): boolean {
  const [ready, setReady] = useState(lyricFontLoaded);
  useEffect(() => {
    if (!ready) void loadLyricFont().then(() => setReady(true));
  }, [ready]);
  return ready;
}

/**
 * am-lyrics fades the four lines either side of the current one (0.7, 0.58,
 * 0.46) and leaves every line past them at its base 0.8, so the fifth line on
 * came back brighter. Those stay at the farthest step. Gaps keep their own
 * opacity, and the library's !important rules (scrolling by hand, unsynced
 * lyrics) still win.
 */
const FAR_LINES =
  '.lyrics-line:not(.active):not(.pre-active):not(.lyrics-activest):not(.post-active-line):not(.next-active-line)' +
  ':not(.prev-2):not(.prev-3):not(.next-2):not(.next-3):not(.lyrics-gap) { opacity: 0.46; }';

/**
 * The full-screen player's sizing (report §7): its line size, set on the host
 * by breakpoint, replaces all three of am-lyrics' container tiers, and the
 * current line sits a third of the way down. Scoped to `data-full`, so the
 * side panel keeps the library's own sizes.
 */
const FULL_SIZE =
  ':host([data-full]) .lyrics-container { --lyplus-font-size-base: var(--bitchord-lyric-size, 34px);' +
  ' --am-lyrics-line-height: 1.2; --am-lyrics-line-spacing: calc(var(--bitchord-lyric-size, 34px) * 0.7);' +
  ' --lyrics-scroll-padding-top: 30%; --am-lyrics-inline-padding: 0px; }';

/** Removes am-lyrics' internal lyrics download controls (format dropdown and download button). */
const HIDE_DOWNLOAD = '.download-controls { display: none !important; }';

/**
 * Moves translate and pronounce (romanization) buttons to the downside, centered,
 * as a floating glass pill styled after the iOS / Apple volume and scrollbar pill capsule,
 * smoothly appearing on mouse movement / hover and auto-hiding when idle.
 */
const DOWNSIDE_CONTROLS =
  ':host { transform: translateZ(0) !important; }' +
  ' .lyrics-header { display: flex !important; position: fixed !important; inset: auto auto 28px 50% !important;' +
  ' transform: translateX(-50%) translateY(10px) !important; z-index: 20 !important; width: auto !important; height: auto !important;' +
  ' padding: 0 !important; margin: 0 !important; opacity: 0 !important; pointer-events: none !important;' +
  ' transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important; }' +
  ' :host([data-controls-visible]) .lyrics-header, .lyrics-header:hover, .lyrics-header:focus-within {' +
  ' opacity: 1 !important; pointer-events: auto !important; transform: translateX(-50%) translateY(0) !important; }' +
  ' .header-controls { display: flex !important; align-items: center !important; gap: 10px !important;' +
  ' padding: 7px 14px !important; border-radius: 9999px !important; background: rgba(28, 28, 34, 0.68) !important;' +
  ' backdrop-filter: blur(36px) saturate(210%) contrast(1.05) !important; -webkit-backdrop-filter: blur(36px) saturate(210%) contrast(1.05) !important;' +
  ' border: 0.5px solid rgba(255, 255, 255, 0.28) !important;' +
  ' box-shadow: 0 14px 44px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 -0.5px 0 rgba(0, 0, 0, 0.3) !important; }' +
  ' .header-controls .download-button { width: 42px !important; height: 42px !important; border-radius: 9999px !important;' +
  ' color: #ffffff !important; background: rgba(255, 255, 255, 0.15) !important; display: inline-flex !important;' +
  ' align-items: center !important; justify-content: center !important; cursor: pointer !important;' +
  ' border: 0.5px solid rgba(255, 255, 255, 0.16) !important;' +
  ' transition: color 0.18s ease, background 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease, border-color 0.18s ease !important; }' +
  ' .header-controls .download-button svg { width: 22px !important; height: 22px !important; stroke: #ffffff !important; color: #ffffff !important;' +
  ' stroke-width: 2.2 !important; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)) !important; transition: stroke 0.18s ease, color 0.18s ease !important; }' +
  ' .header-controls .download-button:hover { color: #ffffff !important; background: rgba(255, 255, 255, 0.28) !important;' +
  ' border-color: rgba(255, 255, 255, 0.35) !important; transform: scale(1.06) !important; }' +
  ' .header-controls .download-button.active { color: #000000 !important; background: #ffffff !important;' +
  ' border-color: #ffffff !important; box-shadow: 0 2px 14px rgba(255, 255, 255, 0.45) !important; }' +
  ' .header-controls .download-button.active svg { stroke: #000000 !important; color: #000000 !important; filter: none !important; }';

/**
 * am-lyrics, exactly as it is, fed our TTML and a steered clock (prompt §10.2).
 * The clock reads the media time each frame, stamps the reading with when it
 * was taken, and is told about every seek and track change: the "lyric clock
 * dates readings by sample time" lesson. No React state per frame: the time is
 * written straight onto the element.
 */
function LyricsView({ ttml, full }: { ttml: string; full: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<AmLyricsElement | null>(null);
  const deck = usePlayer((s) => s.deck);
  const mixing = usePlayer((s) => s.mixing);
  const videoId = usePlayer((s) => s.nowPlaying?.videoId);

  // Created by hand, with its TTML set before it's attached: am-lyrics starts
  // loading the moment it connects, and through React the properties arrive
  // a beat later, so its first load went to its own providers with no title
  // and finished after ours, wiping it.
  useEffect(() => {
    const el = document.createElement('am-lyrics') as AmLyricsElement;
    el.ttml = ttml;
    el.interpolate = true;
    el.autoScroll = true;
    el.highlightColor = '#ffffff';
    el.fontFamily = LYRIC_FONT;
    el.className = 'block min-h-0 flex-1 overflow-hidden [--am-lyrics-highlight-color:#fff]';
    el.toggleAttribute('data-full', full);
    const onLineClick = (event: Event) => {
      const timestamp = (event as CustomEvent<{ timestamp: number }>).detail?.timestamp;
      if (typeof timestamp === 'number') usePlayer.getState().seek(timestamp / 1000);
    };
    el.addEventListener('line-click', onLineClick);

    // Fade-in on hover/mouse move and auto-hide on 2.5s idle
    let idleTimer: number | undefined;
    const hidePills = () => {
      el.removeAttribute('data-controls-visible');
    };
    const showPills = () => {
      el.setAttribute('data-controls-visible', 'true');
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(hidePills, 2500);
    };

    const unmounted = new AbortController();
    const target = host.current;

    el.addEventListener('pointermove', showPills, { passive: true, signal: unmounted.signal });
    el.addEventListener('pointerdown', showPills, { passive: true, signal: unmounted.signal });
    el.addEventListener('pointerleave', () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      hidePills();
    }, { passive: true, signal: unmounted.signal });

    if (target) {
      target.addEventListener('pointermove', showPills, { passive: true, signal: unmounted.signal });
      target.addEventListener('pointerdown', showPills, { passive: true, signal: unmounted.signal });
      target.addEventListener('pointerleave', () => {
        if (idleTimer) window.clearTimeout(idleTimer);
        hidePills();
      }, { passive: true, signal: unmounted.signal });
    }

    host.current?.append(el);
    element.current = el;
    void Promise.resolve(el.updateComplete).then(() => {
      const root = el.shadowRoot;
      if (!root) return;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(HIDE_FOOTER + FAR_LINES + FULL_SIZE + HIDE_DOWNLOAD + DOWNSIDE_CONTROLS);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

      const header = root.querySelector('.lyrics-header');
      if (header) {
        header.addEventListener('pointerenter', () => {
          if (idleTimer) window.clearTimeout(idleTimer);
          el.setAttribute('data-controls-visible', 'true');
        }, { signal: unmounted.signal });
        header.addEventListener('pointerleave', () => {
          if (idleTimer) window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(hidePills, 2500);
        }, { signal: unmounted.signal });
      }

      // The full-screen column fades its top edge, but am-lyrics' toolbar
      // (romanize, translate, download) sits at the top of the same scroller
      // until the lines push it away. The fade grows with the scroll instead,
      // so the toolbar is never under it.
      const scroller = root.querySelector('.lyrics-container');
      if (!full || !scroller || !target) return;
      const fade = () => target.style.setProperty('--lyrics-top-fade', `${Math.min(scroller.scrollTop, 80)}px`);
      fade();
      scroller.addEventListener('scroll', fade, { passive: true, signal: unmounted.signal });
    });
    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      unmounted.abort();
      el.removeEventListener('line-click', onLineClick);
      el.remove();
      element.current = null;
    };
    // Mounted once; a new provider's TTML is handed over below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (element.current && element.current.ttml !== ttml) element.current.ttml = ttml;
  }, [ttml]);

  useEffect(() => {
    const audio = getAudio();
    const el = element.current;
    if (!audio || !el) return;
    if (mixing) {
      // A loop mix plays the song from a deck while its element sits paused:
      // follow the mix's playhead, which loops and moves at the ramped tempo.
      // A loop's wrap (or the handover) is a jump on purpose, not drift to steer out.
      const start = getPlayhead()?.sec ?? audio.currentTime;
      const clock = new LyricClock(start * 1000);
      let discontinuity = 0;
      let last = start;
      let frame = 0;
      const tick = () => {
        const now = performance.now();
        const sec = getPlayhead()?.sec ?? last;
        if (sec < last - 0.15 || sec > last + 1) discontinuity++;
        last = sec;
        el.currentTime = clock.frame(now, Math.trunc(sec * 1000), now, discontinuity);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    const clock = new LyricClock(audio.currentTime * 1000);
    let discontinuity = 0;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      // The reading and its stamp are taken together.
      el.currentTime = clock.frame(now, Math.trunc(audio.currentTime * 1000), now, discontinuity);
      frame = requestAnimationFrame(tick);
    };
    const hold = () => {
      cancelAnimationFrame(frame);
      const ms = audio.currentTime * 1000;
      clock.hold(ms, performance.now());
      el.currentTime = ms;
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      clock.restart();
      frame = requestAnimationFrame(tick);
    };
    const onSeeking = () => {
      discontinuity++;
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
  }, [deck, videoId, ttml, mixing]);

  // am-lyrics renders and scrolls itself; it only needs the space. Full screen fades it out at the top and bottom.
  return (
    <div
      ref={host}
      className={
        full
          ? 'flex min-h-0 flex-1 [mask-image:linear-gradient(180deg,transparent,#000_var(--lyrics-top-fade,0px),#000_50%,transparent)]'
          : 'flex min-h-0 flex-1'
      }
    />
  );
}

function useUngranted(): string[] {
  return useSyncExternalStore(onUngrantedChange, () => [...ungrantedOrigins].join(','), () => '')
    .split(',')
    .filter(Boolean);
}

const NO_STATES: Partial<Record<LyricsSourceId, SourceState>> = {};

/** The provider picker: three-dot menu with drilldown to providers and settings. */
function ProviderPicker({ current, full }: { current: LyricsSourceId | null; full: boolean }) {
  const videoId = usePlayer((s) => s.nowPlaying?.videoId ?? '');
  const states = useLyricsUi((s) => s.states[videoId]) ?? NO_STATES;
  const picked = useLyricsUi((s) => s.picked[videoId]);
  const pick = useLyricsUi((s) => s.pick);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [menuView, setMenuView] = useState<'main' | 'providers'>('main');
  const [settings, setSettings] = useState(false);
  const close = useCallback(() => {
    setAnchor(null);
    setMenuView('main');
  }, []);

  const currentLabel = picked
    ? sourceById(picked)?.label
    : current
      ? sourceById(current)?.label
      : 'Best available';

  return (
    // In full screen the picker sits quietly above the lines, shown on hover.
    <div
      className={
        full
          ? 'flex items-center justify-end pb-1 opacity-0 transition-opacity duration-200 group-hover/panel:opacity-100 focus-within:opacity-100'
          : 'flex items-center justify-end px-4 pt-4 pb-1'
      }
    >
      <button
        className="grid size-7 place-items-center rounded-[8px] text-secondary hover:bg-quinary hover:text-primary transition-colors"
        aria-label="Lyrics options"
        aria-haspopup="menu"
        onClick={(e) => {
          setMenuView('main');
          setAnchor(e.currentTarget);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {anchor && (
        <Menu anchor={anchor} placement="below-end" onClose={close} label="Lyrics menu">
          {menuView === 'providers' ? (
            <>
              <MenuItem icon={<ChevronLeft size={14} />} onSelect={() => setMenuView('main')}>
                Back
              </MenuItem>
              <MenuSeparator />
              <MenuHeader>Lyrics Providers</MenuHeader>
              <MenuItem
                checked={!picked}
                onSelect={() => {
                  close();
                  pick(videoId, null);
                }}
              >
                Best available
              </MenuItem>
              <MenuSeparator />
              {enabledSources().map((id) => {
                const state = states[id];
                return (
                  <MenuItem
                    key={id}
                    checked={picked === id}
                    trailing={
                      state === 'pending' ? (
                        <BeatLoader size={13} />
                      ) : state === 'found' ? (
                        <Check size={13} />
                      ) : state === 'missing' ? (
                        <Minus size={13} />
                      ) : undefined
                    }
                    onSelect={() => {
                      close();
                      pick(videoId, id);
                    }}
                  >
                    {sourceById(id)?.label}
                  </MenuItem>
                );
              })}
            </>
          ) : (
            <>
              <MenuItem
                icon={<ListMusic size={15} />}
                trailing={
                  <span className="flex items-center gap-1 text-tertiary">
                    <span className="text-xs truncate max-w-[90px]">{currentLabel}</span>
                    <ChevronRight size={14} />
                  </span>
                }
                onSelect={() => setMenuView('providers')}
              >
                Lyrics Provider
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Settings2 size={15} />}
                onSelect={() => {
                  close();
                  setSettings(true);
                }}
              >
                Lyric Settings…
              </MenuItem>
            </>
          )}
        </Menu>
      )}
      {settings && <LyricsSettings onClose={() => setSettings(false)} />}
    </div>
  );
}

function PermissionNotice({ origins }: { origins: string[] }) {
  const names = origins.map((o) => new URL(o).host.replace(/^www\./, ''));
  return (
    <div className="mx-4 my-1.5 flex items-center gap-2.5 rounded-[10px] bg-quinary px-2.5 py-2 type-callout text-secondary">
      <span>
        {names.slice(0, 2).join(', ')}
        {names.length > 2 ? ` and ${names.length - 2} more` : ''} need the extension’s permission.
      </span>
      <button
        className="flex-none type-callout-emphasized text-key"
        // The notice stays until the extension confirms the grant (checked when this tab comes back).
        onClick={() => void getBridge()?.call('lyrics.requestPermissions', { origins })}
      >
        Allow
      </button>
    </div>
  );
}

/**
 * The track's Spotify Canvas behind the lyrics, dimmed so they stay legible.
 * Muted and looping, it fades in once it can play and pauses with the music.
 *
 * The blur runs on a quarter-size video that is then scaled up 4×: a 3px blur
 * there reads as about 12px on screen for a sixteenth of the pixels, which is
 * what keeps a blurred, playing video cheap. The 5% overscan on each side
 * keeps the soft edges out of view.
 */
function CanvasBackdrop({ url }: { url: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  useEffect(() => setReady(false), [url]);
  useEffect(() => {
    const el = video.current;
    if (!el || !ready) return;
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing, ready]);
  return (
    <video
      ref={video}
      key={url}
      className="absolute top-[-5%] left-[-5%] -z-1 size-[27.5%] origin-[0_0] scale-400 object-cover opacity-0 blur-[3px] transition-opacity duration-600 [mask-image:linear-gradient(to_bottom,rgb(0_0_0/1),rgb(0_0_0/0.85))] data-ready:opacity-85"
      data-ready={ready || undefined}
      src={url}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      onCanPlay={() => setReady(true)}
      onError={() => setReady(false)}
    />
  );
}

const panel = 'group/panel relative isolate flex min-h-0 flex-1 flex-col overflow-hidden';
// The full-screen player's column (report §7): lines 26px, then 30px from 980px, 36px from 1320px and 42px from 1680px.
const fullSizes =
  '[--bitchord-lyric-size:26px] min-[980px]:[--bitchord-lyric-size:30px] min-[1320px]:[--bitchord-lyric-size:36px] min-[1680px]:[--bitchord-lyric-size:42px]';

/**
 * The lyrics, with their provider picker and empty states: the side panel
 * (report §7), and the right-hand column of the full-screen player, where the
 * lines are larger and the player's mesh stands in for the Canvas.
 */
export function LyricsPanel({ variant = 'panel' }: { variant?: 'panel' | 'full' }) {
  const lyrics = useLyrics();
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const videoId = usePlayer((s) => s.nowPlaying?.videoId ?? '');
  // A provider picked by hand that came back with nothing is named in the
  // empty state: the lyrics didn't go missing, this one provider hasn't got them.
  const picked = useLyricsUi((s) => s.picked[videoId]);
  const ungranted = useUngranted();
  const canvas = useCanvas();
  const fontReady = useLyricFont();
  const result = lyrics.data;
  const full = variant === 'full';
  const empty = full
    ? 'flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center type-title-3 text-secondary'
    : 'flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-20 text-center type-[400_12px/16px] text-secondary';
  const emptyTitle = full ? 'type-title-1-emphasized text-primary' : 'type-[600_12px/16px]';

  return (
    <div className={full ? `${panel} ${fullSizes}` : panel}>
      {canvas && variant === 'panel' && <CanvasBackdrop url={canvas} />}
      <ProviderPicker current={result?.source ?? null} full={full} />
      {/* Only worth raising when nothing was found: then the hosts behind the extension might have it. */}
      {ungranted.length > 0 && !result && !lyrics.isFetching && <PermissionNotice origins={ungranted} />}
      {!hasTrack ? (
        <div className={empty}>
          <p className={emptyTitle}>No lyrics available</p>
          <p>Play a song to see its lyrics here.</p>
        </div>
      ) : (lyrics.isPending && lyrics.fetchStatus !== 'idle') || (result && !fontReady) ? (
        <div className={empty}>
          <BeatLoader size={26} />
        </div>
      ) : result ? (
        <LyricsView ttml={result.ttml} full={full} />
      ) : picked ? (
        <div className={empty}>
          <p className={emptyTitle}>Not on {sourceById(picked)?.label ?? 'this provider'}</p>
          <p>This provider hasn’t got this song. Pick another, or Best available, in the list above.</p>
        </div>
      ) : (
        <div className={empty}>
          <p className={emptyTitle}>No lyrics available</p>
          <p>None of the lyric providers has this song. Try another in the list above.</p>
        </div>
      )}
    </div>
  );
}
