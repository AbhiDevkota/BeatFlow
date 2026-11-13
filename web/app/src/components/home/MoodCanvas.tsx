import { useEffect, useRef } from 'react';
import type { TopPickMoodKey } from '@/lib/homeLayout';

export const MOOD_PERIODS: Record<TopPickMoodKey, number> = {
  ENERGY: 3000,
  RELAX: 5600,
  FEELING_BLUE: 3700,
  FEEL_GOOD: 4000,
  FOCUS: 3600,
  HEARTBREAK: 2700,
  LOVE: 1700,
  AFTER_HOURS: 4500,
  ALONE_TIME: 4000,
  CHILL: 5000,
  COMMUTING: 2400,
  EATING_COOKING: 3200,
  EVENING: 6000,
  FITNESS: 2000,
  GAMING: 6000,
  HOME: 4000,
  MORNING: 5000,
  MOTIVATION: 1800,
  OUTDOORS: 6000,
  PARTY: 3000,
  SLEEP: 4500,
  SOCIAL: 3000,
  SPORTS: 3000,
  SUMMERTIME: 8000,
  HOLIDAY: 8000,
  WEEKEND: 2400,
  WELLBEING: 5000,
  WORK: 2000,
};

interface Frame {
  left: number;
  top: number;
  side: number;
  cx: number;
  cy: number;
  x: (f: number) => number;
  y: (f: number) => number;
  at: (xf: number, yf: number) => { x: number; y: number };
}

function createFrame(left: number, top: number, side: number): Frame {
  return {
    left,
    top,
    side,
    cx: left + side * 0.5,
    cy: top + side * 0.5,
    x: (f: number) => left + side * f,
    y: (f: number) => top + side * f,
    at: (xf: number, yf: number) => ({ x: left + side * xf, y: top + side * yf }),
  };
}

const TAU = Math.PI * 2;

function wave(phase: number, offset: number): number {
  return Math.sin(TAU * (phase + offset));
}

function edgeFade(share: number): number {
  if (share > 0.85) return Math.max(0, Math.min(1, (1 - share) / 0.15));
  if (share < 0.15) return Math.max(0, Math.min(1, share / 0.15));
  return 1;
}

function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}

// ---- Paths -----------------------------------------------------------------

function drawBolt(ctx: CanvasRenderingContext2D, f: Frame) {
  const points = [
    [0.486, 0.123],
    [0.886, 0.123],
    [0.532, 0.509],
    [0.877, 0.509],
    [0.114, 0.895],
    [0.409, 0.614],
    [0.105, 0.614],
  ];
  ctx.beginPath();
  points.forEach(([x, y], idx) => {
    if (idx === 0) ctx.moveTo(f.x(x!), f.y(y!));
    else ctx.lineTo(f.x(x!), f.y(y!));
  });
  ctx.closePath();
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, f: Frame) {
  ctx.beginPath();
  ctx.moveTo(f.x(0.5), f.y(0.06));
  ctx.quadraticCurveTo(f.x(0.56), f.y(0.44), f.x(0.94), f.y(0.5));
  ctx.quadraticCurveTo(f.x(0.56), f.y(0.56), f.x(0.5), f.y(0.94));
  ctx.quadraticCurveTo(f.x(0.44), f.y(0.56), f.x(0.06), f.y(0.5));
  ctx.quadraticCurveTo(f.x(0.44), f.y(0.44), f.x(0.5), f.y(0.06));
  ctx.closePath();
  ctx.stroke();
}

function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 0.12, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.12, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.12, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.12, cy - r * 0.12, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFivePointStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHeart(ctx: CanvasRenderingContext2D, f: Frame) {
  const r = 0.24;
  ctx.beginPath();
  ctx.moveTo(f.x(0.5), f.y(0.92));
  ctx.lineTo(f.x(0.28 - r * 0.707), f.y(0.3 + r * 0.707));
  ctx.arc(f.x(0.28), f.y(0.3), f.side * r, (135 * Math.PI) / 180, (330 * Math.PI) / 180, false);
  ctx.arc(f.x(0.72), f.y(0.3), f.side * r, (210 * Math.PI) / 180, (45 * Math.PI) / 180, false);
  ctx.closePath();
  ctx.stroke();
}

// Pre-compute 320 spiral normalized steps matching Android exactly
const SPIRAL_STEPS: Array<{ x: number; y: number }> = [];
const SPIRAL_TURNS = 5.5;
const SPIRAL_COUNT = 320;
for (let k = 0; k <= SPIRAL_COUNT; k++) {
  const t = k / SPIRAL_COUNT;
  const angle = Math.PI + t * SPIRAL_TURNS * TAU;
  const rx = 0.38 * (1 - 0.72 * t);
  const ry = 0.075 * (1 - 0.55 * t);
  SPIRAL_STEPS.push({
    x: 0.5 + rx * Math.cos(angle),
    y: 0.1 + 0.78 * t + ry * Math.sin(angle),
  });
}

// Pre-compute ECG polyline distances for continuous, subpixel pulse sweep
const ECG_RAW: Array<[number, number]> = [
  [0, 0.55],
  [0.28, 0.55],
  [0.36, 0.42],
  [0.44, 0.76],
  [0.52, 0.18],
  [0.6, 0.84],
  [0.67, 0.55],
  [1, 0.55],
];

interface EcgSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  start: number;
  len: number;
}

const ECG_SEGS: EcgSeg[] = [];
let totalEcgLen = 0;
for (let i = 0; i < ECG_RAW.length - 1; i++) {
  const p1 = ECG_RAW[i]!;
  const p2 = ECG_RAW[i + 1]!;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  ECG_SEGS.push({
    x1: p1[0],
    y1: p1[1],
    x2: p2[0],
    y2: p2[1],
    start: totalEcgLen,
    len,
  });
  totalEcgLen += len;
}

function getEcgPoint(d: number): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(totalEcgLen, d));
  for (const seg of ECG_SEGS) {
    if (clamped <= seg.start + seg.len) {
      const t = seg.len > 0 ? (clamped - seg.start) / seg.len : 0;
      return {
        x: seg.x1 + (seg.x2 - seg.x1) * t,
        y: seg.y1 + (seg.y2 - seg.y1) * t,
      };
    }
  }
  const last = ECG_RAW[ECG_RAW.length - 1]!;
  return { x: last[0], y: last[1] };
}

export interface MoodCanvasProps {
  moodKey: TopPickMoodKey;
  strokeColor: string;
  backgroundColor: string;
  periodMs?: number;
  square?: boolean;
  className?: string;
}

/**
 * 1:1 Skia Canvas implementation directly ported from Android BeatFlow's
 * TopPicksShelf.kt drawEmblem function. Runs at smooth 60fps on GPU canvas.
 */
export function MoodCanvas({
  moodKey,
  strokeColor,
  backgroundColor,
  periodMs = MOOD_PERIODS[moodKey] ?? 4000,
  square = true,
  className = '',
}: MoodCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isVisible = true;

    // Handle high DPI crispness
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Pause when off screen to save CPU
    const io = new IntersectionObserver((entries) => {
      isVisible = entries[0]?.isIntersecting ?? true;
    });
    io.observe(canvas);

    const render = () => {
      animId = requestAnimationFrame(render);
      if (!isVisible) return;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background fill
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, w, h);

      // Frame calculation matching Android Frame
      const side = square ? w * 0.7 : Math.min(w * 0.84, h * 0.62);
      const left = (w - side) / 2;
      const top = square ? (h - side) / 2 : h * 0.37 - side / 2;
      const f = createFrame(left, top, side);

      // Stroke settings
      const strokeWidth = (square ? 2.2 : 2.5) * (side / 110);
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);

      const now = performance.now();
      const phase = (now % periodMs) / periodMs;

      // Draw exact Android emblem
      switch (moodKey) {
        case 'ENERGY': {
          const t = (phase - 0.28) / 0.26;
          const flash = t >= 0 && t <= 1 ? Math.sin(Math.PI * t) : 0;
          if (flash > 0) {
            ctx.save();
            ctx.translate(side * 0.07 * flash, 0);
            ctx.globalAlpha = 0.55 * flash;
            drawBolt(ctx, f);
            ctx.restore();

            ctx.save();
            ctx.translate(-side * 0.05 * flash, 0);
            ctx.globalAlpha = 0.35 * flash;
            drawBolt(ctx, f);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
          drawBolt(ctx, f);
          break;
        }

        case 'RELAX': {
          const stones = [
            { cy: 0.17, w: 0.44, h: 0.18 },
            { cy: 0.38, w: 0.68, h: 0.28 },
            { cy: 0.66, w: 0.84, h: 0.36 },
          ];
          stones.forEach((stone, i) => {
            const sway = wave(phase, i * 0.22);
            const cx = f.x(0.5 + 0.015 * sway);
            const cy = f.y(stone.cy);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(((4 * Math.PI) / 180) * sway);
            ctx.beginPath();
            ctx.ellipse(0, 0, (side * stone.w) / 2, (side * stone.h) / 2, 0, 0, TAU);
            ctx.stroke();
            ctx.restore();
          });
          break;
        }

        case 'FEELING_BLUE': {
          let from = 0;
          let to = 1;
          if (phase < 0.35) {
            from = 0;
            to = 1;
          } else if (phase < 0.8) {
            from = easeInOut((phase - 0.35) / 0.45);
            to = 1;
          } else {
            from = 0;
            to = easeInOut((phase - 0.8) / 0.2);
          }

          const startIdx = Math.floor(from * SPIRAL_COUNT);
          const endIdx = Math.ceil(to * SPIRAL_COUNT);
          if (endIdx > startIdx) {
            ctx.beginPath();
            for (let i = startIdx; i <= endIdx && i < SPIRAL_STEPS.length; i++) {
              const pt = SPIRAL_STEPS[i]!;
              const px = f.x(pt.x);
              const py = f.y(pt.y);
              if (i === startIdx) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          break;
        }

        case 'FEEL_GOOD': {
          const pulse = 0.9 + 0.1 * (0.5 + 0.5 * Math.cos(TAU * phase));
          const sway = wave(phase, 0);
          ctx.save();
          ctx.translate(f.cx, f.cy);
          ctx.rotate(((8 * Math.PI) / 180) * sway);
          ctx.scale(pulse, pulse);
          ctx.translate(-f.cx, -f.cy);
          drawStar(ctx, f);
          ctx.restore();
          break;
        }

        case 'FOCUS': {
          for (let i = 0; i < 4; i++) {
            const share = (i + 1 - phase) / 4;
            ctx.globalAlpha = edgeFade(share);
            ctx.beginPath();
            ctx.arc(f.cx, f.cy, side * 0.5 * share, 0, TAU);
            ctx.stroke();
          }
          break;
        }

        case 'HEARTBREAK': {
          const dash = side * 0.075;
          const gap = side * 0.055;
          ctx.save();
          ctx.setLineDash([dash, gap]);
          ctx.lineDashOffset = -phase * (dash + gap) * 2;
          drawHeart(ctx, f);
          ctx.restore();
          break;
        }

        case 'LOVE': {
          const bump = (at: number) => {
            const d = (phase - at) / 0.06;
            return Math.exp(-d * d);
          };
          const beat = 1 + 0.07 * (bump(0.15) + 0.7 * bump(0.38));
          ctx.save();
          ctx.translate(f.cx, f.cy);
          ctx.scale(beat, beat);
          ctx.translate(-f.cx, -f.cy);
          drawHeart(ctx, f);
          ctx.restore();
          break;
        }

        case 'AFTER_HOURS': {
          // Crescent moon
          ctx.save();
          ctx.beginPath();
          ctx.arc(f.x(0.42), f.y(0.52), side * 0.34, 0, TAU);
          ctx.stroke();
          ctx.restore();

          // 3 Twinkling stars
          const stars = [
            { x: 0.8, y: 0.22, r: 0.07 },
            { x: 0.86, y: 0.58, r: 0.05 },
            { x: 0.68, y: 0.82, r: 0.04 },
          ];
          stars.forEach((s, idx) => {
            const twinkle = 0.25 + 0.75 * (0.5 + 0.5 * wave(phase, idx / 3));
            ctx.save();
            ctx.globalAlpha = twinkle;
            drawSparkle(ctx, f.x(s.x), f.y(s.y), side * s.r);
            ctx.restore();
          });
          break;
        }

        case 'ALONE_TIME': {
          const center = f.at(0.5, 0.55);
          for (let i = 0; i < 4; i++) {
            const share = (i + phase) / 4;
            const rx = side * 0.5 * share;
            ctx.globalAlpha = edgeFade(share);
            ctx.beginPath();
            ctx.ellipse(center.x, center.y, rx, rx * 0.42, 0, 0, TAU);
            ctx.stroke();
          }
          break;
        }

        case 'CHILL': {
          ctx.save();
          ctx.beginPath();
          ctx.rect(f.left, f.top, side, side);
          ctx.clip();
          [0.32, 0.5, 0.68].forEach((y, row) => {
            ctx.beginPath();
            for (let k = 0; k <= 80; k++) {
              const u = k / 80;
              const py = y + 0.05 * Math.sin(TAU * (u / 0.33 - phase - row * 0.15));
              if (k === 0) ctx.moveTo(f.x(u), f.y(py));
              else ctx.lineTo(f.x(u), f.y(py));
            }
            ctx.stroke();
          });
          ctx.restore();
          break;
        }

        case 'COMMUTING': {
          ctx.beginPath();
          ctx.moveTo(f.x(0.06), f.y(0.95));
          ctx.lineTo(f.x(0.44), f.y(0.14));
          ctx.moveTo(f.x(0.94), f.y(0.95));
          ctx.lineTo(f.x(0.56), f.y(0.14));
          ctx.moveTo(f.x(0.15), f.y(0.14));
          ctx.lineTo(f.x(0.85), f.y(0.14));
          ctx.stroke();

          for (let k = 0; k < 5; k++) {
            const u = (k / 5 + phase) % 1;
            const y0 = 0.18 + 0.77 * u * u;
            const y1 = Math.min(y0 + 0.02 + 0.08 * u, 0.95);
            ctx.save();
            ctx.globalAlpha = edgeFade(u);
            ctx.beginPath();
            ctx.moveTo(f.x(0.5), f.y(y0));
            ctx.lineTo(f.x(0.5), f.y(y1));
            ctx.stroke();
            ctx.restore();
          }
          break;
        }

        case 'EATING_COOKING': {
          // Bowl rim & base
          ctx.beginPath();
          ctx.moveTo(f.x(0.05), f.y(0.6));
          ctx.lineTo(f.x(0.95), f.y(0.6));
          ctx.arc(f.x(0.5), f.y(0.6), side * 0.38, 0, Math.PI, false);
          ctx.stroke();

          // Steam
          [0.36, 0.5, 0.64].forEach((x, idx) => {
            const rise = (phase + idx / 3) % 1;
            ctx.save();
            ctx.globalAlpha = Math.sin(Math.PI * rise);
            ctx.beginPath();
            for (let k = 0; k <= 30; k++) {
              const u = k / 30;
              const px = x + 0.035 * Math.sin(TAU * (u * 1.2 + rise));
              const py = 0.5 - 0.3 * u - 0.1 * rise;
              if (k === 0) ctx.moveTo(f.x(px), f.y(py));
              else ctx.lineTo(f.x(px), f.y(py));
            }
            ctx.stroke();
            ctx.restore();
          });
          break;
        }

        case 'EVENING': {
          const horizon = 0.62;
          const sink = 0.14 * (0.5 - 0.5 * Math.cos(TAU * phase));
          const clipY = f.top - side;
          const clipH = f.y(horizon) - clipY;

          ctx.save();
          ctx.beginPath();
          ctx.rect(f.left - side, clipY, side * 3, clipH);
          ctx.clip();

          // Sinking sun disc dipping below horizon line
          ctx.beginPath();
          ctx.arc(f.x(0.5), f.y(horizon - 0.02 + sink), side * 0.26, 0, TAU);
          ctx.stroke();
          ctx.restore();

          // Horizon line
          ctx.beginPath();
          ctx.moveTo(f.x(0.04), f.y(horizon));
          ctx.lineTo(f.x(0.96), f.y(horizon));
          ctx.stroke();

          // Shimmering reflection lines
          const shimmer = 0.75 + 0.25 * (0.5 + 0.5 * wave(phase, 0.2));
          ctx.save();
          ctx.globalAlpha = shimmer;
          ctx.beginPath();
          ctx.moveTo(f.x(0.2), f.y(horizon + 0.11));
          ctx.lineTo(f.x(0.8), f.y(horizon + 0.11));
          ctx.moveTo(f.x(0.36), f.y(horizon + 0.22));
          ctx.lineTo(f.x(0.64), f.y(horizon + 0.22));
          ctx.stroke();
          ctx.restore();
          break;
        }

        case 'FITNESS': {
          // Dim background ECG trace
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ECG_RAW.forEach(([x, y], idx) => {
            if (idx === 0) ctx.moveTo(f.x(x), f.y(y));
            else ctx.lineTo(f.x(x), f.y(y));
          });
          ctx.stroke();
          ctx.restore();

          // Continuous, subpixel smooth bright pulse head
          const head = phase * 1.4 * totalEcgLen;
          const tail = Math.max(0, head - 0.45 * totalEcgLen);
          const effectiveHead = Math.min(totalEcgLen, head);

          if (effectiveHead > tail) {
            ctx.save();
            ctx.lineWidth = strokeWidth * 1.35;
            ctx.strokeStyle = strokeColor;
            ctx.beginPath();
            const startPt = getEcgPoint(tail);
            ctx.moveTo(f.x(startPt.x), f.y(startPt.y));
            for (let i = 0; i < ECG_SEGS.length; i++) {
              const seg = ECG_SEGS[i]!;
              const segEndDist = seg.start + seg.len;
              if (segEndDist > tail && segEndDist < effectiveHead) {
                ctx.lineTo(f.x(seg.x2), f.y(seg.y2));
              }
            }
            const endPt = getEcgPoint(effectiveHead);
            ctx.lineTo(f.x(endPt.x), f.y(endPt.y));
            ctx.stroke();

            // Bright glowing pulse point at the leading head
            if (effectiveHead < totalEcgLen) {
              ctx.fillStyle = strokeColor;
              ctx.beginPath();
              ctx.arc(f.x(endPt.x), f.y(endPt.y), strokeWidth * 0.9, 0, TAU);
              ctx.fill();
            }
            ctx.restore();
          }
          break;
        }

        case 'GAMING': {
          [0.9, 0.62, 0.34].forEach((sz, idx) => {
            const turn = (idx % 2 === 0 ? 1 : -1) * phase * ((90 * Math.PI) / 180);
            ctx.save();
            ctx.translate(f.cx, f.cy);
            ctx.rotate(turn);
            const box = side * sz;
            ctx.strokeRect(-box / 2, -box / 2, box, box);
            ctx.restore();
          });
          break;
        }

        case 'HOME': {
          // House outline
          const house: ReadonlyArray<readonly [number, number]> = [
            [0.5, 0.1],
            [0.94, 0.5],
            [0.82, 0.5],
            [0.82, 0.92],
            [0.18, 0.92],
            [0.18, 0.5],
            [0.06, 0.5],
          ];
          ctx.beginPath();
          house.forEach(([x, y], idx) => {
            if (idx === 0) ctx.moveTo(f.x(x), f.y(y));
            else ctx.lineTo(f.x(x), f.y(y));
          });
          ctx.closePath();
          ctx.stroke();

          // Door
          ctx.strokeRect(f.x(0.41), f.y(0.66), side * 0.18, side * 0.26);

          // Chimney on the roof
          ctx.strokeRect(f.x(0.7), f.y(0.2), side * 0.08, side * 0.14);

          // Cozy smoke curling up from the chimney
          for (let i = 0; i < 2; i++) {
            const u = (phase + i * 0.5) % 1;
            const py = f.y(0.18 - 0.18 * u);
            const px = f.x(0.74 + 0.035 * Math.sin(TAU * u));
            const r = side * (0.02 + 0.035 * u);
            ctx.save();
            ctx.globalAlpha = Math.sin(Math.PI * u) * 0.65;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, TAU);
            ctx.stroke();
            ctx.restore();
          }

          // Warm breathing window light with radiant glow
          const glow = 0.5 + 0.5 * wave(phase, 0);
          const wx = f.x(0.32);
          const wy = f.y(0.61);

          // Soft radial light halo cast around the window
          const halo = ctx.createRadialGradient(wx, wy, side * 0.03, wx, wy, side * 0.22);
          halo.addColorStop(0, strokeColor);
          halo.addColorStop(1, 'transparent');
          ctx.save();
          ctx.globalAlpha = 0.35 * glow;
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(wx, wy, side * 0.22, 0, TAU);
          ctx.fill();
          ctx.restore();

          // Bright window pane
          ctx.save();
          ctx.globalAlpha = 0.25 + 0.65 * glow;
          ctx.fillRect(f.x(0.27), f.y(0.56), side * 0.1, side * 0.1);
          ctx.restore();
          ctx.strokeRect(f.x(0.27), f.y(0.56), side * 0.1, side * 0.1);
          break;
        }

        case 'MORNING': {
          const horizon = 0.72;
          const sunCenter = f.at(0.5, horizon - 0.03 - 0.08 * (0.5 + 0.5 * wave(phase, 0)));
          const clipY = f.top - side;
          const clipH = f.y(horizon) - clipY;

          ctx.save();
          ctx.beginPath();
          ctx.rect(f.left - side, clipY, side * 3, clipH);
          ctx.clip();

          // Sun semi-circle
          ctx.beginPath();
          ctx.arc(sunCenter.x, sunCenter.y, side * 0.2, 0, TAU);
          ctx.stroke();

          // 9 Radiant sun rays rotating with the morning light
          for (let k = 0; k < 9; k++) {
            const angle = Math.PI + ((k + 0.5) * Math.PI) / 9 + phase * 0.45;
            const ax = sunCenter.x + side * 0.28 * Math.cos(angle);
            const ay = sunCenter.y + side * 0.28 * Math.sin(angle);
            const bx = sunCenter.x + side * 0.38 * Math.cos(angle);
            const by = sunCenter.y + side * 0.38 * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
          ctx.restore();

          // Horizon line
          ctx.beginPath();
          ctx.moveTo(f.x(0.04), f.y(horizon));
          ctx.lineTo(f.x(0.96), f.y(horizon));
          ctx.stroke();
          break;
        }

        case 'MOTIVATION': {
          for (let k = 0; k < 3; k++) {
            const u = (k / 3 + phase) % 1;
            const y = 0.82 - 0.66 * u;
            ctx.save();
            ctx.globalAlpha = Math.sin(Math.PI * u);
            ctx.beginPath();
            ctx.moveTo(f.x(0.22), f.y(y + 0.17));
            ctx.lineTo(f.x(0.5), f.y(y));
            ctx.lineTo(f.x(0.78), f.y(y + 0.17));
            ctx.stroke();
            ctx.restore();
          }
          break;
        }

        case 'OUTDOORS': {
          const ridge = [
            [0.02, 0.86],
            [0.36, 0.36],
            [0.55, 0.62],
            [0.7, 0.44],
            [0.98, 0.86],
          ];
          ctx.beginPath();
          ridge.forEach(([x, y], idx) => {
            if (idx === 0) ctx.moveTo(f.x(x!), f.y(y!));
            else ctx.lineTo(f.x(x!), f.y(y!));
          });
          ctx.moveTo(f.x(0.02), f.y(0.86));
          ctx.lineTo(f.x(0.98), f.y(0.86));
          ctx.stroke();

          // Drifting sun
          ctx.beginPath();
          ctx.arc(
            f.x(0.78 + 0.02 * wave(phase, 0.25)),
            f.y(0.2 + 0.02 * wave(phase, 0)),
            side * 0.09,
            0,
            TAU
          );
          ctx.stroke();
          break;
        }

        case 'PARTY': {
          const confetti = [
            { x: 0.24, y: 0.24, r: 0.14 },
            { x: 0.72, y: 0.18, r: 0.11 },
            { x: 0.52, y: 0.5, r: 0.17 },
            { x: 0.2, y: 0.72, r: 0.1 },
            { x: 0.8, y: 0.66, r: 0.13 },
            { x: 0.56, y: 0.88, r: 0.08 },
          ];
          confetti.forEach((c, idx) => {
            const pop = 0.85 + 0.15 * wave(phase, idx / 6);
            const spin = (idx % 2 === 0 ? 1 : -1) * phase * TAU;
            ctx.save();
            ctx.translate(f.x(c.x), f.y(c.y));
            ctx.rotate(spin);
            ctx.scale(pop, pop);
            drawFivePointStar(ctx, 0, 0, side * c.r);
            ctx.restore();
          });
          break;
        }

        case 'SLEEP': {
          const breath = 1 + 0.04 * wave(phase, 0);
          ctx.save();
          ctx.translate(f.cx, f.cy);
          ctx.scale(breath, breath);
          ctx.translate(-f.cx, -f.cy);

          ctx.beginPath();
          ctx.arc(f.x(0.5), f.y(0.43), side * 0.38, (20 * Math.PI) / 180, (160 * Math.PI) / 180, false);
          ctx.stroke();

          for (let k = 0; k < 5; k++) {
            const angle = ((30 + k * 30) * Math.PI) / 180;
            const bx = f.x(0.5 + 0.38 * Math.cos(angle));
            const by = f.y(0.43 + 0.23 * Math.sin(angle));
            const tx = bx + side * 0.08 * Math.cos(angle);
            const ty = by + side * 0.1 * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(tx, ty);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }

        case 'SOCIAL': {
          const gap = 0.12 + 0.07 * wave(phase, 0);
          ctx.beginPath();
          ctx.arc(f.x(0.5 - gap), f.y(0.5), side * 0.27, 0, TAU);
          ctx.arc(f.x(0.5 + gap), f.y(0.5), side * 0.27, 0, TAU);
          ctx.stroke();
          break;
        }

        case 'SPORTS': {
          const r = side * 0.44;
          ctx.save();
          ctx.beginPath();
          ctx.arc(f.cx, f.cy, r, 0, TAU);
          ctx.stroke();
          ctx.clip();

          ctx.translate(f.cx, f.cy);
          ctx.rotate(phase * TAU);
          ctx.beginPath();
          ctx.arc(-r * 1.25, 0, r * 0.95, 0, TAU);
          ctx.arc(r * 1.25, 0, r * 0.95, 0, TAU);
          ctx.stroke();
          ctx.restore();
          break;
        }

        case 'SUMMERTIME': {
          ctx.beginPath();
          ctx.arc(f.cx, f.cy, side * 0.22, 0, TAU);
          ctx.stroke();

          ctx.save();
          ctx.translate(f.cx, f.cy);
          ctx.rotate(phase * ((30 * Math.PI) / 180));
          for (let k = 0; k < 12; k++) {
            const angle = (k * TAU) / 12;
            const ax = side * 0.31 * Math.cos(angle);
            const ay = side * 0.31 * Math.sin(angle);
            const bx = side * 0.46 * Math.cos(angle);
            const by = side * 0.46 * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }

        case 'HOLIDAY': {
          ctx.save();
          ctx.translate(f.cx, f.cy);
          ctx.rotate(phase * ((60 * Math.PI) / 180));
          for (let k = 0; k < 6; k++) {
            const angle = (k * TAU) / 6;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(side * 0.46 * dirX, side * 0.46 * dirY);
            ctx.stroke();

            [0.22, 0.34].forEach((d) => {
              const basex = side * d * dirX;
              const basey = side * d * dirY;
              [-0.785, 0.785].forEach((turn) => {
                const a = angle + turn;
                ctx.beginPath();
                ctx.moveTo(basex, basey);
                ctx.lineTo(basex + side * 0.1 * Math.cos(a), basey + side * 0.1 * Math.sin(a));
                ctx.stroke();
              });
            });
          }
          ctx.restore();
          break;
        }

        case 'WEEKEND': {
          ctx.beginPath();
          ctx.arc(f.cx, f.cy, side * 0.46, 0, TAU);
          ctx.arc(f.cx, f.cy, side * 0.16, 0, TAU);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(f.cx, f.cy, side * 0.025, 0, TAU);
          ctx.fill();

          ctx.save();
          ctx.translate(f.cx, f.cy);
          ctx.rotate(phase * TAU);
          [0.36, 0.27].forEach((r) => {
            ctx.beginPath();
            ctx.arc(0, 0, side * r, (200 * Math.PI) / 180, (270 * Math.PI) / 180);
            ctx.arc(0, 0, side * r, (20 * Math.PI) / 180, (90 * Math.PI) / 180);
            ctx.stroke();
          });
          ctx.restore();
          break;
        }

        case 'WELLBEING': {
          const open = 0.85 + 0.15 * wave(phase, 0);
          const base = f.at(0.5, 0.84);
          [-62, -31, 0, 31, 62].forEach((deg) => {
            ctx.save();
            ctx.translate(base.x, base.y);
            ctx.rotate((deg * open * Math.PI) / 180);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
              side * 0.16,
              -side * 0.32,
              0,
              -side * (0.7 - (1 - open) * 0.3)
            );
            ctx.quadraticCurveTo(-side * 0.16, -side * 0.32, 0, 0);
            ctx.stroke();
            ctx.restore();
          });
          break;
        }

        case 'WORK': {
          // Laptop screen
          ctx.strokeRect(f.x(0.16), f.y(0.18), side * 0.68, side * 0.48);
          // Base
          ctx.beginPath();
          ctx.moveTo(f.x(0.04), f.y(0.78));
          ctx.lineTo(f.x(0.96), f.y(0.78));
          ctx.moveTo(f.x(0.16), f.y(0.66));
          ctx.lineTo(f.x(0.04), f.y(0.78));
          ctx.moveTo(f.x(0.84), f.y(0.66));
          ctx.lineTo(f.x(0.96), f.y(0.78));
          ctx.stroke();

          // Typing line
          const typed = 0.28 + 0.36 * Math.min(phase * 1.25, 1);
          ctx.beginPath();
          ctx.moveTo(f.x(0.28), f.y(0.36));
          ctx.lineTo(f.x(0.64), f.y(0.36));
          ctx.moveTo(f.x(0.28), f.y(0.48));
          ctx.lineTo(f.x(typed), f.y(0.48));
          ctx.stroke();

          // Blinking cursor
          if (Math.floor(phase * 4) % 2 === 0) {
            ctx.beginPath();
            ctx.moveTo(f.x(typed + 0.04), f.y(0.43));
            ctx.lineTo(f.x(typed + 0.04), f.y(0.53));
            ctx.stroke();
          }
          break;
        }
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      io.disconnect();
    };
  }, [moodKey, strokeColor, backgroundColor, periodMs, square]);

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} />;
}
