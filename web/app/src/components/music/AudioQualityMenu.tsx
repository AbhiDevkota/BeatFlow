import { useEffect, useRef } from 'react';
import { Headphones, X } from 'lucide-react';
import { DolbyAtmosIcon, LosslessWaveIcon } from './SourceQualityBadge';
import { usePlayer } from '@/state/player';

export interface AudioQualityMenuProps {
  onClose: () => void;
  align?: 'center' | 'left';
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBitrate(kbps: number | null | undefined): string | null {
  if (!kbps || kbps <= 0) return null;
  return `${kbps.toLocaleString()} kbps`;
}

/**
 * 1-to-1 BitChord-PC / Apple Music Audio Quality Menu (src/ui/nowplaying.rs: audio_info_menu).
 * Displays full stream specifications, format, codec, sample rate, bit depth, and provider.
 */
export function AudioQualityMenu({ onClose, align = 'center' }: AudioQualityMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const nowPlaying = usePlayer((s) => s.nowPlaying);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!nowPlaying) return null;

  const s = nowPlaying.stream;
  const rawQuality = nowPlaying.sourceQuality;
  const codec = s?.codec ?? '';
  const bitDepth = s?.bitDepth ?? null;
  const sampleRateHz = s?.sampleRateHz ?? null;
  const bitrateKbps = s?.bitrateKbps ?? null;
  const channels = s?.channels ?? 2;

  const isDolbyAtmos =
    rawQuality === 'DOLBY_ATMOS' ||
    codec.toLowerCase().includes('dolby') ||
    codec.toLowerCase().includes('e-ac-3') ||
    codec.toLowerCase().includes('atmos');

  const isLossless =
    !isDolbyAtmos &&
    (rawQuality === 'LOSSLESS' ||
      rawQuality === 'HI_RES_LOSSLESS' ||
      ['flac', 'alac', 'wav', 'aiff', 'pcm'].some((c) => codec.toLowerCase().includes(c)));

  const isHiRes =
    rawQuality === 'HI_RES_LOSSLESS' ||
    (isLossless && (Boolean(bitDepth && bitDepth > 16) || Boolean(sampleRateHz && sampleRateHz > 48000)));

  const badgeTitle = isDolbyAtmos
    ? 'Dolby Atmos'
    : isHiRes
      ? 'Hi-Res Lossless'
      : isLossless
        ? 'Lossless'
        : bitrateKbps && bitrateKbps >= 320
          ? '320 kbps'
          : 'High Quality';

  const sourceName =
    nowPlaying.sourceName ||
    (nowPlaying.videoId.startsWith('beatflow://local/')
      ? 'BeatFlow Local'
      : s?.client
        ? s.client
        : 'YouTube Music');

  const alignmentClass = align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2';

  return (
    <div
      ref={ref}
      className={`absolute bottom-full mb-3 z-50 w-76 rounded-2xl bg-[#1c1c20]/95 backdrop-blur-xl border border-white/15 p-4 shadow-2xl text-white select-none animate-enter ${alignmentClass}`}
      role="dialog"
      aria-label="Audio Quality Specifications"
    >
      <div className="flex items-center justify-between pb-1">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-white/50">
          Audio Quality
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-5 place-items-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex items-center gap-2.5 py-2">
        {isDolbyAtmos ? (
          <DolbyAtmosIcon size={20} className="text-white shrink-0" />
        ) : isLossless ? (
          <LosslessWaveIcon
            size={22}
            className={`shrink-0 ${isHiRes ? 'text-amber-400' : 'text-white'}`}
          />
        ) : (
          <Headphones size={18} className="text-white/60 shrink-0" />
        )}
        <span className={`text-[17px] font-semibold tracking-tight ${isHiRes ? 'text-amber-300' : 'text-white'}`}>
          {badgeTitle}
        </span>
      </div>

      <div className="h-px bg-white/10 my-2" />

      <div className="flex flex-col gap-2 text-[12.5px] py-1">
        <div className="flex items-center justify-between">
          <span className="text-white/50">Source</span>
          <span className="font-semibold text-white truncate max-w-[170px]" title={sourceName}>
            {sourceName}
          </span>
        </div>

        {codec && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Codec</span>
            <span className="font-semibold text-white uppercase">{codec}</span>
          </div>
        )}

        {bitrateKbps && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Bitrate</span>
            <span className="font-semibold text-white">{formatBitrate(bitrateKbps)}</span>
          </div>
        )}

        {sampleRateHz && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Sample rate</span>
            <span className="font-semibold text-white">
              {sampleRateHz >= 1000000
                ? `${(sampleRateHz / 1000000).toFixed(2)} MHz`
                : `${+(sampleRateHz / 1000).toFixed(1)} kHz`}
            </span>
          </div>
        )}

        {bitDepth && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Bit depth</span>
            <span className="font-semibold text-white">{bitDepth}-bit</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-white/50">Channels</span>
          <span className="font-semibold text-white">
            {channels === 6 ? '6 (5.1 Surround)' : channels === 1 ? 'Mono' : 'Stereo'}
          </span>
        </div>

        {nowPlaying.durationSec > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Duration</span>
            <span className="font-semibold text-white">{formatDuration(nowPlaying.durationSec)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
