import { useState } from 'react';
import { Headphones } from 'lucide-react';
import { usePlayer } from '@/state/player';
import { DolbyAtmosIcon, LosslessWaveIcon } from './SourceQualityBadge';
import { AudioQualityMenu } from './AudioQualityMenu';

export interface PlaybackQualityLabelProps {
  compact?: boolean;
  className?: string;
  menuAlign?: 'center' | 'left';
}

/**
 * 1-to-1 BitChord-PC / Apple Music / BeatFlow Android PlaybackQualityLabel.
 * Positioned cleanly between elapsed and remaining timestamps under the seek bar,
 * and as an inline quality icon in the mini player.
 * Has sweeping shimmer for Lossless / Dolby Atmos / Hi-Res Lossless,
 * breathing pulse for Upgrading Quality, and opens the Audio Quality menu on click.
 */
export function PlaybackQualityLabel({
  compact = false,
  className = '',
  menuAlign = compact ? 'left' : 'center',
}: PlaybackQualityLabelProps) {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const upgradingQuality = usePlayer((s) => s.upgradingQuality);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const iconSize = compact ? 12 : 13;
  const waveSize = compact ? 13 : 14;

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
    text = bitrateKbps && bitrateKbps >= 320 ? '320 kbps' : 'High Quality';
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
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className={`inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px] leading-none tracking-tight hover:opacity-100 transition-opacity duration-150 focus:outline-hidden ${className}`}
        title={details ? `${details} (Click for audio quality specs)` : 'Click for audio quality specs'}
        aria-label={`Audio quality: ${text}. Click for audio quality specs.`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        {iconNode}
        {!compact && <span className={textClass}>{text}</span>}
      </button>

      {menuOpen && <AudioQualityMenu align={menuAlign} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
