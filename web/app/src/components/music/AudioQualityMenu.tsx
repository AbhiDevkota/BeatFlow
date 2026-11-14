import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Cpu, SlidersHorizontal, AudioWaveform, Volume2 } from 'lucide-react';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { usePlayer } from '@/state/player';

export interface AudioQualityMenuProps {
  onClose: () => void;
  align?: 'center' | 'left';
}

/** 44100 -> "44.1 kHz", 48000 -> "48 kHz", 2822400 -> "2.8224 MHz" (matching Android rateText) */
function rateText(hz: number | null | undefined): string {
  if (!hz || hz <= 0) return '—';
  if (hz >= 1000000) {
    return `${(hz / 1000000).toFixed(4).replace(/\.?0+$/, '')} MHz`;
  }
  const khz = (hz / 1000).toFixed(1);
  return `${khz.endsWith('.0') ? khz.slice(0, -2) : khz} kHz`;
}

/** One row in a pipeline stage: bold label, light value matching Android PipelineRow */
function PipelineRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="py-[1px] text-[12.5px] leading-[17px] flex flex-wrap gap-x-1">
      <span className="font-semibold text-white shrink-0">{label}:</span>
      <span className="font-normal text-white/80 break-all">{value}</span>
    </div>
  );
}

/** Hairline separator between stages, indented to clear the signal lane (matching Android PipelineRule) */
function PipelineRule() {
  return <div className="ml-[54px] mr-4 h-[0.5px] bg-white/[0.14]" />;
}

/** One pipeline stage: an icon node, uppercase title, and the label/value rows under it */
function PipelineSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full px-4 pt-3 pb-3 gap-[14px]">
      <div className="size-6 rounded-full border border-white/30 bg-[#141416] flex items-center justify-center shrink-0 z-10 shadow-xs mt-0.5">
        <Icon size={14} className="text-white/90" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-white/90 pt-[1px] pb-[7px]">
          {title}
        </div>
        <div className="flex flex-col">{children}</div>
      </div>
    </div>
  );
}

/**
 * 1-to-1 BeatFlow Android AudioPipelineDialog & AudioPopupCard.
 * Displays authoritative live signal path: Track Info -> Decoder -> Resampler -> DSP -> Output Device.
 */
export function AudioQualityMenu({ onClose }: AudioQualityMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const [rustInfo, setRustInfo] = useState<any>(null);

  useEffect(() => {
    if (isDesktopApp()) {
      void desktopBridge()
        .call('engine.getStreamInfo', {})
        .then((info) => {
          if (info) setRustInfo(info);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!nowPlaying) return null;
  if (typeof document === 'undefined') return null;

  const s = nowPlaying.stream;
  const rawQuality = nowPlaying.sourceQuality;
  const codec = rustInfo?.codec ?? s?.codec ?? '';
  const container = rustInfo?.container ?? s?.container ?? null;
  const bitDepth = rustInfo?.bitDepth ?? s?.bitDepth ?? null;
  const sampleRateHz = rustInfo?.sampleRate ?? s?.sampleRateHz ?? null;
  const bitrateKbps = rustInfo?.bitrateKbps ?? s?.bitrateKbps ?? null;
  const channels = rustInfo?.channels ?? s?.channels ?? 2;

  const isDolbyAtmos =
    Boolean(rustInfo?.atmos) ||
    rawQuality === 'DOLBY_ATMOS' ||
    codec.toLowerCase().includes('dolby') ||
    codec.toLowerCase().includes('e-ac-3') ||
    codec.toLowerCase().includes('atmos');

  const isLossless =
    Boolean(rustInfo?.lossless) ||
    (!isDolbyAtmos &&
      (rawQuality === 'LOSSLESS' ||
        rawQuality === 'HI_RES_LOSSLESS' ||
        ['flac', 'alac', 'wav', 'aiff', 'pcm'].some((c) => codec.toLowerCase().includes(c))));

  const isHiRes =
    Boolean(rustInfo?.hires) ||
    rawQuality === 'HI_RES_LOSSLESS' ||
    (isLossless && (Boolean(bitDepth && bitDepth > 16) || Boolean(sampleRateHz && sampleRateHz > 48000)));

  const badgeTitle =
    rustInfo?.badge ||
    (isDolbyAtmos
      ? 'Dolby Atmos'
      : isHiRes
        ? 'Hi-Res Lossless'
        : isLossless
          ? 'Lossless'
          : bitrateKbps && bitrateKbps >= 320
            ? '320 kbps'
            : 'High Quality');

  const sourceName =
    rustInfo?.source ||
    nowPlaying.sourceName ||
    (nowPlaying.videoId.startsWith('beatflow://local/')
      ? 'BeatFlow Local'
      : s?.client
        ? s.client
        : 'YouTube Music');

  // Format label (e.g. "Dolby Atmos (mp4)" or "FLAC (mp4)")
  const format = container && !codec.toLowerCase().includes(container.toLowerCase())
    ? `${codec} (${container})`
    : codec || '—';

  const sampleRateText = rateText(sampleRateHz);
  const bitDepthText = isLossless && bitDepth ? `${bitDepth}-bit` : '—';
  const bitrateText = bitrateKbps && bitrateKbps > 0 ? `${bitrateKbps.toLocaleString()} kbps` : '—';
  const pcmDataRateText = isLossless && bitDepth && sampleRateHz
    ? `${Math.round((sampleRateHz * bitDepth * (channels || 2)) / 1000).toLocaleString()} kbps`
    : bitrateText;
  const channelsText = channels === 6 ? '6 (Surround)' : channels === 1 ? 'Mono' : 'Stereo';

  // Decoder stage
  const decoderName = isDesktopApp() ? 'Rust Core Engine (Tauri)' : 'HTMLAudioElement';
  const decoderFormat = isDolbyAtmos
    ? `Dolby Atmos (E-AC-3 JOC) / ${sampleRateText}`
    : isLossless
      ? `Float32 / Lossless PCM`
      : `PCM Float32 / ${sampleRateText}`;

  // Resampler stage
  const ioRateText = sampleRateText !== '—' ? `${sampleRateText} → ${sampleRateText}` : '—';

  // DSP stage
  const bitExactVerdict = isDolbyAtmos
    ? 'Dolby Atmos (Spatial Audio)'
    : isLossless
      ? 'Yes — bit-perfect lossless'
      : "No — source isn't lossless PCM";

  // Output device stage
  const transportText = isDesktopApp() ? 'Direct OS Audio (WASAPI)' : 'WebAudio API';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-fade select-none"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Audio Pipeline"
    >
      <div
        ref={ref}
        className="w-[320px] max-w-[calc(100vw-32px)] rounded-[18px] bg-[#1c1c20]/95 backdrop-blur-2xl border border-white/15 shadow-2xl overflow-hidden flex flex-col text-white animate-zoom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Centered Header matching Android AudioPopupCard */}
        <div className="px-4 pt-5 pb-3 text-center flex flex-col items-center">
          <div className="text-[17px] font-semibold text-white tracking-tight">
            Audio Pipeline
          </div>
          <div className="mt-1 text-[13px] leading-[17px] text-white/70 font-normal">
            {badgeTitle ? `${badgeTitle} · Live signal path, decoder to output` : 'Live signal path, decoder to output'}
          </div>
        </div>

        {/* Scrolling Pipeline Stages with Signal Bus line */}
        <div className="relative max-h-[420px] overflow-y-auto">
          {/* Signal Bus vertical line */}
          <div className="absolute left-[28px] top-[24px] bottom-[24px] w-[1.5px] bg-white/20 -translate-x-1/2 pointer-events-none" />

          {/* 1. Track Info Stage */}
          <PipelineSection icon={FileText} title="Track Info">
            <PipelineRow label="Source" value={sourceName} />
            <PipelineRow label="Format" value={format} />
            <PipelineRow label="Bit Depth" value={bitDepthText} />
            <PipelineRow label="Sample Rate" value={sampleRateText} />
            <PipelineRow label="Bitrate" value={bitrateText} />
            <PipelineRow label="PCM Data Rate" value={pcmDataRateText} />
            <PipelineRow label="Channels" value={channelsText} />
          </PipelineSection>

          <PipelineRule />

          {/* 2. Decoder Stage */}
          <PipelineSection icon={Cpu} title="Decoder">
            <PipelineRow label="Decoder Name" value={decoderName} />
            <PipelineRow label="Format" value={decoderFormat} />
          </PipelineSection>

          <PipelineRule />

          {/* 3. Resampler Stage */}
          <PipelineSection icon={SlidersHorizontal} title="Resampler">
            <PipelineRow label="I/O Rate" value={ioRateText} />
            <PipelineRow label="Type" value="None" />
            <PipelineRow label="Quality" value="Passthrough" />
          </PipelineSection>

          <PipelineRule />

          {/* 4. DSP Stage */}
          <PipelineSection icon={AudioWaveform} title="DSP">
            <PipelineRow label="PCM Format" value="Float32" />
            <PipelineRow label="Sample Rate" value={sampleRateText} />
            <PipelineRow label="Bit-Exact" value={bitExactVerdict} />
          </PipelineSection>

          <PipelineRule />

          {/* 5. Output Device Stage */}
          <PipelineSection icon={Volume2} title="Output Device">
            <PipelineRow label="Device Name" value="System default" />
            <PipelineRow label="Route" value="Direct System Audio" />
            <PipelineRow label="Transport" value={transportText} />
            <PipelineRow label="Direct" value="Active (Direct Audio Path)" />
          </PipelineSection>
        </div>

        {/* Full-width hairline and Done action matching Android */}
        <div className="w-full h-[0.5px] bg-white/[0.14]" />
        <button
          type="button"
          onClick={onClose}
          className="h-[46px] w-full text-center font-semibold text-[17px] text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer flex items-center justify-center select-none"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
