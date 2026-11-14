import { useCallback, useEffect, useRef, useState } from 'react';
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
  nodeRef,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  nodeRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full px-4 pt-3 pb-3 gap-[14px] relative z-10">
      <div
        ref={nodeRef}
        className="size-6 rounded-full border border-white/30 bg-[#131315] flex items-center justify-center shrink-0 z-10 shadow-xs mt-0.5"
      >
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageNodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const [rustInfo, setRustInfo] = useState<any>(null);

  // Custom Apple / iOS style floating overlay scrollbar
  const [scrollPill, setScrollPill] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) {
      setScrollPill({ top: 0, height: 0, visible: false });
      return;
    }
    const trackHeight = clientHeight - 8;
    const ratio = clientHeight / scrollHeight;
    const computedHeight = Math.max(28, Math.min(trackHeight - 8, Math.round(ratio * trackHeight)));
    const maxScroll = scrollHeight - clientHeight;
    const maxThumbTop = trackHeight - computedHeight;
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const computedTop = 4 + scrollRatio * maxThumbTop;

    setScrollPill({
      top: computedTop,
      height: computedHeight,
      visible: true,
    });

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setScrollPill((prev) => ({ ...prev, visible: false }));
    }, 800);
  }, []);

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

  // 1-to-1 Android AudioPipelineDialog: 60fps dynamic signal bus & travelling energy pulse canvas animation
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    const container = scrollContainerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodeRadius = 12; // 24px diameter / 2
    const xCenter = 28; // 16px padding + 12px

    const render = (time: number) => {
      const containerRect = container.getBoundingClientRect();
      const points: number[] = [];
      for (let i = 0; i < 5; i++) {
        const el = stageNodeRefs.current[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          points.push(rect.top - containerRect.top + container.scrollTop + rect.height / 2);
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const w = 56;
      const h = container.scrollHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      if (points.length === 5 && points[0] !== undefined && points[4] !== undefined) {
        const y0 = points[0];
        const y4 = points[4];
        const totalHeight = y4 - y0;

        // 1. Static Node-to-Node Signal Bus Segments (~2px)
        const busAlpha = isPlaying ? 0.28 : 0.18;
        ctx.strokeStyle = `rgba(255, 255, 255, ${busAlpha})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'butt';

        for (let i = 0; i < points.length - 1; i++) {
          const ptStart = points[i];
          const ptEnd = points[i + 1];
          if (ptStart === undefined || ptEnd === undefined) continue;
          const yStart = ptStart + nodeRadius;
          const yEnd = ptEnd - nodeRadius;
          if (yEnd > yStart) {
            ctx.beginPath();
            ctx.moveTo(xCenter, yStart);
            ctx.lineTo(xCenter, yEnd);
            ctx.stroke();

            // Subtle ambient under-glow along the bus when playing
            if (isPlaying) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
              ctx.lineWidth = 4.5;
              ctx.beginPath();
              ctx.moveTo(xCenter, yStart);
              ctx.lineTo(xCenter, yEnd);
              ctx.stroke();
              ctx.lineWidth = 2;
              ctx.strokeStyle = `rgba(255, 255, 255, ${busAlpha})`;
            }
          }
        }

        // 2. Dynamic Travelling Signal Pulse along Segments (When Playing)
        let yPulse = -100;
        if (isPlaying && totalHeight > 0) {
          const pulseProgress = (time % 2400) / 2400;
          const s = Math.min(1, pulseProgress / 0.85);
          yPulse = y0 + s * totalHeight;
          const tailLength = 38;
          const leadLength = 8;

          for (let i = 0; i < points.length - 1; i++) {
            const ptStart = points[i];
            const ptEnd = points[i + 1];
            if (ptStart === undefined || ptEnd === undefined) continue;
            const yStart = ptStart + nodeRadius;
            const yEnd = ptEnd - nodeRadius;
            if (yEnd <= yStart) continue;

            const pStart = Math.max(yStart, yPulse - tailLength);
            const pEnd = Math.min(yEnd, yPulse + leadLength);

            if (pEnd > pStart) {
              // A. Soft Halo Line
              const haloGrad = ctx.createLinearGradient(xCenter, yPulse - tailLength, xCenter, yPulse + leadLength);
              haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
              haloGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.14)');
              haloGrad.addColorStop(0.88, 'rgba(255, 255, 255, 0.28)');
              haloGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

              ctx.strokeStyle = haloGrad;
              ctx.lineWidth = 6;
              ctx.beginPath();
              ctx.moveTo(xCenter, pStart);
              ctx.lineTo(xCenter, pEnd);
              ctx.stroke();

              // B. Brilliant Core Energy Line
              const coreGrad = ctx.createLinearGradient(xCenter, yPulse - tailLength, xCenter, yPulse + leadLength);
              coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
              coreGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
              coreGrad.addColorStop(0.86, 'rgba(255, 255, 255, 0.98)');
              coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

              ctx.strokeStyle = coreGrad;
              ctx.lineWidth = 2.25;
              ctx.beginPath();
              ctx.moveTo(xCenter, pStart);
              ctx.lineTo(xCenter, pEnd);
              ctx.stroke();

              // C. Leading Micro-Photon Pip
              if (yPulse >= yStart && yPulse <= yEnd) {
                const pipGlow = ctx.createRadialGradient(xCenter, yPulse, 0, xCenter, yPulse, 7);
                pipGlow.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
                pipGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = pipGlow;
                ctx.beginPath();
                ctx.arc(xCenter, yPulse, 7, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
                ctx.beginPath();
                ctx.arc(xCenter, yPulse, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }

        // 3. Precision Node Anchors & Outline Glow at each stage
        for (let i = 0; i < points.length; i++) {
          const cy = points[i];
          if (cy === undefined) continue;
          const dist = Math.abs(yPulse - cy);
          const act = isPlaying && dist < 24 ? Math.cos((dist / 24) * (Math.PI / 2)) : 0;

          // A. Dark Backing Base
          ctx.fillStyle = '#131315';
          ctx.beginPath();
          ctx.arc(xCenter, cy, nodeRadius, 0, Math.PI * 2);
          ctx.fill();

          // B. Ambient Halo
          const haloAlpha = 0.10 + 0.24 * act;
          const nodeHalo = ctx.createRadialGradient(xCenter, cy, nodeRadius - 2, xCenter, cy, nodeRadius + 5);
          nodeHalo.addColorStop(0, `rgba(255, 255, 255, ${haloAlpha * 0.4})`);
          nodeHalo.addColorStop(0.5, `rgba(255, 255, 255, ${haloAlpha})`);
          nodeHalo.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = nodeHalo;
          ctx.beginPath();
          ctx.arc(xCenter, cy, nodeRadius + 5, 0, Math.PI * 2);
          ctx.fill();

          // C. Active Outer Luminous Flare Ring
          if (act > 0.02) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 * act})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(xCenter, cy, nodeRadius + 1.2, 0, Math.PI * 2);
            ctx.stroke();
          }

          // D. Precision Outline Micro-Ring
          const ringAlpha = Math.min(1, 0.35 + 0.55 * act);
          ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(xCenter, cy, nodeRadius, 0, Math.PI * 2);
          ctx.stroke();

          // E. High-Luminance Core Edge
          if (act > 0.05) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * act})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(xCenter, cy, nodeRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

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
      className="fixed inset-0 z-[var(--z-modal,10001)] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-fade select-none"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Audio Pipeline"
    >
      <div
        ref={ref}
        className="w-[320px] max-w-[calc(100vw-32px)] rounded-[18px] bg-[#1c1c20]/95 backdrop-blur-2xl border border-white/15 shadow-2xl overflow-hidden flex flex-col text-white animate-zoom relative"
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

        {/* Scrolling Pipeline Stages with Signal Bus line & Custom Scrollbar */}
        <div className="relative overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="relative max-h-[420px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Live animated canvas drawing the signal bus, travelling photon pulses & node halos */}
            <canvas ref={canvasRef} className="absolute left-0 top-0 w-[56px] pointer-events-none z-0" />

            {/* 1. Track Info Stage */}
            <PipelineSection
              icon={FileText}
              title="Track Info"
              nodeRef={(el) => {
                stageNodeRefs.current[0] = el;
              }}
            >
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
            <PipelineSection
              icon={Cpu}
              title="Decoder"
              nodeRef={(el) => {
                stageNodeRefs.current[1] = el;
              }}
            >
              <PipelineRow label="Decoder Name" value={decoderName} />
              <PipelineRow label="Format" value={decoderFormat} />
            </PipelineSection>

            <PipelineRule />

            {/* 3. Resampler Stage */}
            <PipelineSection
              icon={SlidersHorizontal}
              title="Resampler"
              nodeRef={(el) => {
                stageNodeRefs.current[2] = el;
              }}
            >
              <PipelineRow label="I/O Rate" value={ioRateText} />
              <PipelineRow label="Type" value="None" />
              <PipelineRow label="Quality" value="Passthrough" />
            </PipelineSection>

            <PipelineRule />

            {/* 4. DSP Stage */}
            <PipelineSection
              icon={AudioWaveform}
              title="DSP"
              nodeRef={(el) => {
                stageNodeRefs.current[3] = el;
              }}
            >
              <PipelineRow label="PCM Format" value="Float32" />
              <PipelineRow label="Sample Rate" value={sampleRateText} />
              <PipelineRow label="Bit-Exact" value={bitExactVerdict} />
            </PipelineSection>

            <PipelineRule />

            {/* 5. Output Device Stage */}
            <PipelineSection
              icon={Volume2}
              title="Output Device"
              nodeRef={(el) => {
                stageNodeRefs.current[4] = el;
              }}
            >
              <PipelineRow label="Device Name" value="System default" />
              <PipelineRow label="Route" value="Direct System Audio" />
              <PipelineRow label="Transport" value={transportText} />
              <PipelineRow label="Direct" value="Active (Direct Audio Path)" />
            </PipelineSection>
          </div>

          {/* Scrollbar styled matching the volume bar slider track */}
          <div
            className="absolute right-1 top-2 bottom-2 w-1 pointer-events-none transition-opacity duration-300 z-20"
            style={{ opacity: scrollPill.visible ? 1 : 0 }}
          >
            <div className="absolute inset-0 w-1 rounded-[2px] bg-white/[0.08]" />
            <div
              className="relative w-1 rounded-[2px] bg-white/50 transition-[height,transform] duration-75 ease-out ml-auto"
              style={{
                height: `${scrollPill.height}px`,
                transform: `translateY(${scrollPill.top}px)`,
              }}
            />
          </div>
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
