import { useEffect, useReducer, useState } from 'react';
import { useParty } from '@/party/listenTogether';
import type { AutoDJSnapshot } from '@/playback/automix';
import type { analyzer as Analyzer } from '@/playback/automix/analysis/analyzer';
import type { NowPlaying } from '@/state/player';
import { usePlayer } from '@/state/player';

/**
 * Stats for nerds, under the artist in the full-screen player (the phone's
 * SleeveNerdStats): the stream as it plays, and under it, dimmer, what
 * Automix is doing. Nothing at all while the setting is off.
 */
export function NerdStats() {
  const show = usePlayer((s) => s.showNerdStats);
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const automix = usePlayer((s) => s.automix);
  if (!show || !nowPlaying) return null;
  return (
    // The phone's shadow: free on the dark mesh, and what keeps it legible over a bright music video.
    <div className="mt-1 flex min-w-0 flex-col gap-px type-[500_11px/14px] tabular-nums [text-shadow:0_1px_4px_rgb(0_0_0/0.55)]">
      <span className="truncate text-secondary">{describeStream(nowPlaying) ?? 'Measuring the stream…'}</span>
      {automix && <AutomixLine videoId={nowPlaying.videoId} />}
    </div>
  );
}

import { Activity, X } from 'lucide-react';

/**
 * 1-to-1 Android NerdStats.Snapshot.describe().
 * e.g. "FLAC · 24-bit · 96.0 kHz · 4608 kbps · Stereo · via Qobuz Addon"
 */
export function describeStream(np: NowPlaying): string | null {
  const s = np.stream;
  if (!s) return null;
  const parts = [
    s.codec,
    s.bitDepth ? `${s.bitDepth}-bit` : null,
    s.sampleRateHz ? `${+(s.sampleRateHz / 1000).toFixed(1)} kHz` : null,
    s.bitrateKbps ? `${s.bitrateKbps} kbps` : null,
    s.channels
      ? s.channels === 1
        ? 'Mono'
        : s.channels === 2
          ? 'Stereo'
          : s.channels === 6
            ? '5.1 Surround'
            : `${s.channels} channels`
      : null,
    np.sourceName ? `via ${np.sourceName}` : s.itag ? `itag ${s.itag} · ${s.client} ${s.mode}` : s.client ? `via ${s.client}` : null,
    np.upgraded ? '[Upgraded]' : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * YouTube Music-style Stats for Nerds floating HUD overlay.
 * Appears when showNerdStats is enabled, providing real-time telemetry
 * for codec, bit depth, sample rate, bitrate, buffer health, and addon provider.
 */
export function StatsForNerdsOverlay() {
  const show = usePlayer((s) => s.showNerdStats);
  const setShow = usePlayer((s) => s.setShowNerdStats);
  const np = usePlayer((s) => s.nowPlaying);
  const status = usePlayer((s) => s.status);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  const [bufferSec, setBufferSec] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);

  useEffect(() => {
    if (!show) return;
    const interval = setInterval(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (audio) {
        setCurrentTimeSec(audio.currentTime);
        if (audio.buffered.length > 0) {
          try {
            const end = audio.buffered.end(audio.buffered.length - 1);
            setBufferSec(Math.max(0, +(end - audio.currentTime).toFixed(1)));
          } catch {}
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [show]);

  if (!show || !np) return null;

  const s = np.stream;
  const rawQuality = np.sourceQuality;
  const isUpgraded = Boolean(np.upgraded);
  const provider =
    np.sourceName ||
    (np.videoId.startsWith('beatflow://local/') ? 'BeatFlow Local' : s?.client || 'YouTube Music Direct');

  return (
    <div
      className="fixed top-12 right-6 z-[9999] w-84 rounded-xl bg-black/85 backdrop-blur-md border border-white/15 p-4 shadow-2xl text-[11px] font-mono text-white/90 select-none"
      role="dialog"
      aria-label="Stats for Nerds"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Activity size={14} className="text-key" />
          <span>Stats for Nerds</span>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="grid size-5 place-items-center rounded-full hover:bg-white/15 text-white/70 hover:text-white transition-colors"
          aria-label="Close Stats for Nerds"
        >
          <X size={12} />
        </button>
      </div>

      <div className="grid grid-cols-[105px_1fr] gap-y-1.5 gap-x-2 text-[10.5px]">
        <span className="text-white/50">Video ID / CPN:</span>
        <span className="truncate text-white/90 font-mono" title={np.videoId}>
          {np.videoId.slice(0, 18)}...
        </span>

        <span className="text-white/50">Audio Codec:</span>
        <span className="text-white/95 font-medium">{s?.codec || 'Detecting...'}</span>

        <span className="text-white/50">Bit Depth:</span>
        <span className="text-white/90">{s?.bitDepth ? `${s.bitDepth}-bit` : '16-bit / Standard'}</span>

        <span className="text-white/50">Sample Rate:</span>
        <span className="text-white/90">
          {s?.sampleRateHz ? `${+(s.sampleRateHz / 1000).toFixed(1)} kHz` : '44.1 kHz'}
        </span>

        <span className="text-white/50">Bitrate:</span>
        <span className="text-white/90">{s?.bitrateKbps ? `${s.bitrateKbps} kbps` : 'Unknown'}</span>

        <span className="text-white/50">Audio Channels:</span>
        <span className="text-white/90">
          {s?.channels === 6 ? '6 (Dolby Atmos 5.1)' : s?.channels === 1 ? '1 (Mono)' : '2 (Stereo)'}
        </span>

        <span className="text-white/50">Audio Provider:</span>
        <span className="truncate text-key font-medium" title={provider}>
          {provider}
        </span>

        <span className="text-white/50">Quality Tier:</span>
        <span className="text-white/95 font-medium">
          {rawQuality || (s?.bitrateKbps && s.bitrateKbps >= 1000 ? 'Lossless' : 'Standard')}
        </span>

        <span className="text-white/50">Upgrade Status:</span>
        <span className={isUpgraded ? 'text-amber-400 font-medium' : 'text-white/70'}>
          {isUpgraded ? 'Upgraded (Lossless Active)' : 'Original Stream'}
        </span>

        <span className="text-white/50">Buffer Health:</span>
        <span className="text-white/90">{bufferSec} s</span>

        <span className="text-white/50">Volume / Norm:</span>
        <span className="text-white/90">
          {muted ? '0% (Muted)' : `${Math.round(volume * 100)}%`} / 100%
        </span>

        <span className="text-white/50">Player State:</span>
        <span className="capitalize text-white/90">
          {status} ({currentTimeSec.toFixed(1)}s / {np.durationSec}s)
        </span>
      </div>
    </div>
  );
}

/** Automix's line: both songs' analysis while it waits, the blend once one is planned. Both sides always named. */
function AutomixLine({ videoId }: { videoId: string }) {
  const state = usePlayer((s) => s.automixState);
  const nextInQueue = usePlayer((s) => s.queue[s.index + 1]?.track.videoId ?? null);
  const inParty = useParty((s) => !!s.code);
  const analyzer = useAnalyzer();

  let text: string;
  if (inParty) text = 'Automix: stopped in Listen Together';
  else if (state?.state === 'scheduled' && state.plan) text = describeBlend(state);
  else if (state?.loop) text = `Automix · loop mix ready · ${describeLoop(state)}`;
  else {
    // This song is read where it will be mixed out (its ending's grid), the next where it comes in (its opening's).
    const label = (id: string | null, outgoing: boolean) => {
      if (!id || !analyzer) return 'waiting';
      const a = analyzer.get(id);
      if (a) {
        const g = outgoing && a.tailGrid !== undefined ? a.tailGrid : a.bpm ? { bpm: a.bpm, gridConfidence: a.gridConfidence } : null;
        const key = a.camelot ? ` ${a.camelot.num}${a.camelot.letter}` : '';
        const video = a.musicVideo ? ', music video: no loop' : '';
        if (!g) return `analysed (no beat${key}${video})`;
        const grid = g.gridConfidence >= 0.2 ? `grid ${g.gridConfidence.toFixed(2)}` : `weak grid ${g.gridConfidence.toFixed(2)}`;
        return `analysed (${Math.round(g.bpm)} BPM${key}, ${grid}${video})`;
      }
      const status = analyzer.statusOf(id);
      return status === 'analyzing' ? 'analysing…' : status === 'error' ? 'failed' : 'waiting';
    };
    const next = state?.nextKey ?? nextInQueue;
    text = `Automix · this song: ${label(videoId, true)} · next: ${next ? label(next, false) : 'none'}`;
  }
  // Dimmer than the stream line: that one describes the audio, this one the app.
  return <span className="truncate text-tertiary">{text}</span>;
}

/** "out 4-bar loop, clear by lyrics · in 2-bar, clear by mask · 111 → 85 BPM over 11 bars". */
function describeLoop(state: AutoDJSnapshot): string {
  const l = state.loop!;
  const from = Math.round(l.out.bpm);
  const to = Math.round(l.in.bpm / l.fold);
  const tempo = from === to ? `${from} BPM` : `${from} → ${to} BPM over ${l.rampBars} bars`;
  const fold = l.fold === 1 ? '' : l.fold > 1 ? ' (next in double time)' : ' (next in half time)';
  const side = (p: typeof l.out) => `${p.bars}-bar, clear by ${p.checkedBy}`;
  return `out ${side(l.out)} · in ${side(l.in)} · ${tempo}${fold}`;
}

function describeBlend(state: AutoDJSnapshot): string {
  const plan = state.plan!;
  const when =
    state.startsInSec !== null && state.startsInSec > 0 ? `in ${Math.ceil(state.startsInSec)} s` : 'now';
  if (plan.style === 'loop' && state.loop) {
    return `Automix · ${state.startsInSec !== null && state.startsInSec > 0 ? `loop mix ${when}` : 'looping'} · ${describeLoop(state)}`;
  }
  if (plan.style === 'crossfade') return `Automix · crossfading ${when} · ${Math.round(plan.durationSec)} s · ${plan.reason ?? 'no beat match'}`;
  const bars = state.beatSec ? Math.round(plan.durationSec / (4 * state.beatSec)) : null;
  if (plan.style === 'filter') return `Automix · filter mix ${when} · ${bars ? `${bars} bars` : `${plan.durationSec.toFixed(1)} s`} · ${plan.reason}`;
  const stretch = Math.abs(plan.rate - 1) < 0.0005 ? 'same tempo' : `next at ${plan.rate.toFixed(3)}×`;
  return `Automix · mixing ${when} · ${bars ? `${bars} bars` : `${plan.durationSec.toFixed(1)} s`} · ${stretch}`;
}

/** The analysis queue, once the Automix code is loaded; re-renders as its statuses change. */
function useAnalyzer(): typeof Analyzer | null {
  const [instance, setInstance] = useState<typeof Analyzer | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let live = true;
    void import('@/playback/automix/analysis/analyzer').then(({ analyzer }) => {
      if (!live) return;
      setInstance(analyzer);
      unsubscribe = analyzer.subscribe(bump);
    });
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);
  return instance;
}

/**
 * The stretch of the seek bar the next Automix blend covers (the phone's
 * transitionWindow): brighter than the unplayed track, under the played
 * fill, feathered at both ends because a blend has no hard edge in time.
 * Once the blend runs it steps aside for the fill's own beat pulse
 * (useScrubber). Place it inside the bar's track, before the fill.
 */
export function MixWindowHighlight() {
  const mix = usePlayer((s) => s.automixState?.window ?? null);
  const startsIn = usePlayer((s) => s.automixState?.startsInSec ?? null);
  const videoId = usePlayer((s) => s.nowPlaying?.videoId);
  const duration = usePlayer((s) => s.nowPlaying?.durationSec ?? 0);
  const automix = usePlayer((s) => s.automix);
  // The last window stays drawn while it fades out.
  const [shown, setShown] = useState(mix);
  useEffect(() => {
    if (mix) setShown(mix);
  }, [mix]);
  const visible = automix && !!mix && mix.videoId === videoId && duration > 0;
  const w = shown;
  if (!w || duration <= 0) return null;
  const left = Math.max(0, Math.min(1, w.startSec / duration));
  const right = Math.max(left, Math.min(1, w.endSec / duration));
  // once the blend runs, the bar's own fill covers it and breathes on the beat (useScrubber)
  const blending = startsIn !== null && startsIn <= 0;
  return (
    <div
      className="pointer-events-none absolute inset-y-0 transition-opacity duration-500"
      style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%`, opacity: visible && !blending ? 1 : 0 }}
      aria-hidden="true"
    >
      <div
        className="size-full bg-tertiary"
        style={{
          maskImage: 'linear-gradient(to right, transparent, #000 30%, #000 70%, transparent)',
        }}
      />
    </div>
  );
}
