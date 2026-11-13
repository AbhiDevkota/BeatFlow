import { Headphones } from 'lucide-react';
import { usePlayer } from '@/state/player';
import { DolbyAtmosIcon, LosslessWaveIcon } from './SourceQualityBadge';

export interface PlaybackQualityLabelProps {
  compact?: boolean;
  className?: string;
}

/**
 * 1-to-1 Android PlaybackQualityLabel.
 * Positioned cleanly between elapsed and remaining timestamps under the seek bar.
 * Has sweeping shimmer for Lossless / Dolby Atmos / Hi-Res Lossless,
 * breathing pulse for Upgrading Quality, and toggles Stats for Nerds on click.
 */
export function PlaybackQualityLabel({ compact = false, className = '' }: PlaybackQualityLabelProps) {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const upgradingQuality = usePlayer((s) => s.upgradingQuality);
  const showNerdStats = usePlayer((s) => s.showNerdStats);
  const setShowNerdStats = usePlayer((s) => s.setShowNerdStats);

  if (!nowPlaying && !upgradingQuality) return null;

  const s = nowPlaying?.stream;
  const rawQuality = nowPlaying?.sourceQuality;
  const codec = s?.codec?.toLowerCase() ?? '';
  const bitDepth = s?.bitDepth ?? null;
  const sampleRateHz = s?.sampleRateHz ?? null;
  const bitrateKbps = s?.bitrateKbps ?? null;

  const isDolbyAtmos =
    rawQuality === 'DOLBY_ATMOS' ||
    codec.includes('dolby') ||
    codec.includes('e-ac-3') ||
    codec.includes('ec-3') ||
    codec.includes('atmos');

  const isLossless =
    !isDolbyAtmos &&
    (rawQuality === 'LOSSLESS' ||
      rawQuality === 'HI_RES_LOSSLESS' ||
      ['flac', 'alac', 'wav', 'aiff', 'pcm'].some((c) => codec.includes(c)));

  const isHiRes =
    rawQuality === 'HI_RES_LOSSLESS' ||
    (isLossless && (Boolean(bitDepth && bitDepth > 16) || Boolean(sampleRateHz && sampleRateHz > 48000)));

  const isHiQuality =
    !isDolbyAtmos &&
    !isLossless &&
    (rawQuality === 'HIGH_QUALITY' || (bitrateKbps !== null && bitrateKbps >= 256));

  if (!upgradingQuality && !isDolbyAtmos && !isLossless && !isHiQuality) {
    return null;
  }

  const iconSize = compact ? 11 : 13;
  const waveSize = compact ? 12 : 14;

  let iconNode = null;
  let text = '';
  let textClass = '';

  if (upgradingQuality) {
    text = 'Upgrading Quality';
    iconNode = <LosslessWaveIcon size={waveSize} className="animate-upgrading-pulse text-white/80" />;
    textClass = 'animate-upgrading-pulse text-white/80 font-medium';
  } else if (isDolbyAtmos) {
    text = 'Dolby Atmos';
    iconNode = <DolbyAtmosIcon size={iconSize} className="text-white/85" />;
    textClass = 'animate-lossless-shimmer font-medium';
  } else if (isHiRes) {
    text = 'Hi-Res Lossless';
    iconNode = <LosslessWaveIcon size={waveSize} className="text-amber-400" />;
    textClass = 'animate-hires-shimmer font-medium';
  } else if (isLossless) {
    text = 'Lossless';
    iconNode = <LosslessWaveIcon size={waveSize} className="text-white/85" />;
    textClass = 'animate-lossless-shimmer font-medium';
  } else if (isHiQuality) {
    text = 'High Quality';
    iconNode = <Headphones size={iconSize} className="text-white/45" />;
    textClass = 'text-white/45 font-medium';
  }

  // Tooltip with detailed audio stats
  const details = [
    s?.codec,
    bitDepth ? `${bitDepth}-bit` : null,
    sampleRateHz ? `${+(sampleRateHz / 1000).toFixed(1)} kHz` : null,
    bitrateKbps ? `${bitrateKbps} kbps` : null,
    nowPlaying?.sourceName ? `via ${nowPlaying.sourceName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={() => setShowNerdStats(!showNerdStats)}
      className={`inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px] leading-none tracking-tight hover:opacity-100 transition-opacity duration-150 focus:outline-hidden ${className}`}
      title={details ? `${details} (Click for Stats for Nerds)` : 'Click to toggle Stats for Nerds'}
      aria-label={`Audio quality: ${text}. Click to toggle Stats for Nerds.`}
    >
      {iconNode}
      <span className={textClass}>{text}</span>
    </button>
  );
}
