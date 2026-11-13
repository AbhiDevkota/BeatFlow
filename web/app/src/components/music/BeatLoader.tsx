export interface BeatLoaderProps {
  className?: string;
  size?: number;
  color?: string;
  bars?: 3 | 4;
}

/**
 * Animated music beat loading & buffering indicator.
 * Displays smooth, organically oscillating audio waveform beat bars with
 * cubic-bezier sine-wave easing, replacing circular spinners with fluid
 * musical rhythm.
 */
export function BeatLoader({
  className = '',
  size = 18,
  color,
  bars = 4,
}: BeatLoaderProps) {
  // Proportional bar dimensions and gaps matching given scale
  const barWidth = Math.max(1.5, Math.round(size * 0.12 * 10) / 10);
  const gap = Math.max(1.5, Math.round(size * 0.1 * 10) / 10);
  const height = Math.round(size * 0.72);

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, ...(color ? { color } : {}) }}
      role="status"
      aria-label="Loading..."
    >
      <div
        className="flex items-center justify-center"
        style={{ height, gap }}
      >
        <span
          className="rounded-full bg-current origin-center animate-beat-buffer-1"
          style={{ width: barWidth, height: '100%' }}
        />
        <span
          className="rounded-full bg-current origin-center animate-beat-buffer-2"
          style={{ width: barWidth, height: '100%' }}
        />
        <span
          className="rounded-full bg-current origin-center animate-beat-buffer-3"
          style={{ width: barWidth, height: '100%' }}
        />
        {bars === 4 && (
          <span
            className="rounded-full bg-current origin-center animate-beat-buffer-4"
            style={{ width: barWidth, height: '100%' }}
          />
        )}
      </div>
    </div>
  );
}
