import type { PuzzleState } from '../level/types';

export type PlanetTheme = 'earth' | 'mars';

export interface PlanetSpectrumBand {
  color: string;
  intensity: number;
}

interface PlanetPalette {
  highlight: string;
  mid: string;
  shadow: string;
  accent: string;
}

const PALETTES: Record<PlanetTheme, PlanetPalette> = {
  earth: {
    highlight: '#7fd3ff',
    mid: '#2f7ddb',
    shadow: '#123a70',
    accent: '#7fd3ff',
  },
  mars: {
    highlight: '#ffb37f',
    mid: '#d9622f',
    shadow: '#6e2410',
    accent: '#ff8a4d',
  },
};

/**
 * State the caller (device page) hands to draw() on every `level-state`
 * message. Illumination and the power ring are both scaled against
 * `goalMinPower`, not a flat 0-100 — a level with a low goal should read as
 * "lit" at a proportionally lower raw percent than a level with a high one.
 */
export interface PlanetVisualState {
  /** 0-100 raw receiver power right now. */
  percent: number;
  /** 0-100 power this receiver's current level goal requires. */
  goalMinPower: number;
  puzzleState: PuzzleState;
  /** 0..1 fill of the separate stabilize ring. Only drawn while
   * puzzleState is 'STABILIZING' — spec: ring circumference fills over the
   * ~1.5s continuous-hold window. */
  stabilizeProgress: number;
  /** The exact wavelength colors currently landing in this receiver. */
  spectrumBands?: PlanetSpectrumBand[];
  /** Timestamp (same clock as the `nowMs` draw() argument) the puzzle
   * became SOLVED. Present only once solved; drives a brief one-shot
   * ripple, not a looping effect. */
  solvedAtMs?: number;
}

type IlluminationTier = 'dark' | 'weak' | 'clear' | 'satisfied';

/** Tier is a function of percent-vs-goal, not raw percent — see
 * PlanetVisualState.goalMinPower doc above. */
function illuminationTier(percent: number, goalMinPower: number): IlluminationTier {
  const ratio = goalMinPower > 0 ? percent / goalMinPower : 0;
  if (ratio >= 1) return 'satisfied';
  if (ratio >= 0.5) return 'clear';
  if (ratio >= 0.25) return 'weak';
  return 'dark';
}

// How much of the base body gradient shows through, per tier — 0 fully
// hidden under the dark overlay below, 1 fully showing.
const TIER_BRIGHTNESS: Record<IlluminationTier, number> = {
  dark: 0.12,
  weak: 0.4,
  clear: 0.8,
  satisfied: 1,
};

const RIPPLE_DURATION_MS = 900;
const PULSE_PERIOD_MS = 1400;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Thin wrapper around a full-window <canvas> that draws a receiver planet
 * (Earth or Mars): body illumination tiered off percent-vs-goal, a power
 * progress ring, a stabilize ring that fills while STABILIZING, and a
 * brief ripple once SOLVED. Mirrors the PrismRenderer convention: sizes to
 * the window, re-sizes on `window resize`, and re-draws at the last known
 * state after a resize so content never vanishes. Pure canvas 2d rendering
 * only — no shadowBlur, no filter, no compositeOperation changes — so it
 * stays cheap to redraw on every `level-state` message. Illumination tiers
 * are approximated with a single flat dark overlay rather than a second
 * clipped gradient pass for a day/night terminator — cheap, and restrained
 * enough not to read as an "effect" in its own right.
 */
export class ReceiverPlanetRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: PlanetTheme;
  private lastState: PlanetVisualState = {
    percent: 0,
    goalMinPower: 100,
    puzzleState: 'INTRO',
    stabilizeProgress: 0,
  };
  private lastNowMs = 0;

  constructor(canvas: HTMLCanvasElement, theme: PlanetTheme) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ReceiverPlanetRenderer: 2d context unavailable');
    this.ctx = ctx;
    this.theme = theme;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.draw(this.lastState, this.lastNowMs);
  }

  /** Draws the planet + power ring + (conditionally) stabilize ring / solved
   * ripple for the given state. `nowMs` drives the tiny satisfied-tier
   * pulse and the solved ripple's decay — pass performance.now() (or a
   * test clock value); it is not read internally. */
  draw(state: PlanetVisualState, nowMs: number): void {
    this.lastState = state;
    this.lastNowMs = nowMs;

    const { percent, goalMinPower, puzzleState, stabilizeProgress, solvedAtMs, spectrumBands = [] } = state;
    const ratio = goalMinPower > 0 ? percent / goalMinPower : 0;
    const tier = illuminationTier(percent, goalMinPower);

    const { ctx, canvas, theme } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const planetR = Math.min(canvas.width, canvas.height) * 0.16;
    const ringR = planetR * 1.6;
    const stabilizeRingR = planetR * 1.32;

    const palette = PALETTES[theme];

    // Shared by the satisfied-tier ring pulse and the solved look. Derived
    // from nowMs directly (no internal timer) since draw() is only ever
    // called from the outside, on each new message.
    const pulse = 0.5 + 0.5 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2);

    // --- Planet body ----------------------------------------------------
    const bodyGradient = ctx.createRadialGradient(
      cx - planetR * 0.3,
      cy - planetR * 0.3,
      planetR * 0.05,
      cx,
      cy,
      planetR
    );
    bodyGradient.addColorStop(0, palette.highlight);
    bodyGradient.addColorStop(0.55, palette.mid);
    bodyGradient.addColorStop(1, palette.shadow);

    ctx.beginPath();
    ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient;
    ctx.fill();

    const overlayAlpha = (1 - TIER_BRIGHTNESS[tier]) * 0.85;
    if (overlayAlpha > 0.001) {
      ctx.beginPath();
      ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(4,6,10,${overlayAlpha})`;
      ctx.fill();
    }

    // Project the same wavelength sequence that left PRISM onto the planet
    // body. This is intentionally clipped to the globe and screen-blended,
    // so its rainbow reads as received light rather than replacing the
    // planet's own material colors.
    if (spectrumBands.length > 0) {
      const spectrumGradient = ctx.createLinearGradient(
        cx - planetR,
        cy - planetR * 0.45,
        cx + planetR,
        cy + planetR * 0.45
      );
      if (spectrumBands.length === 1) {
        spectrumGradient.addColorStop(0, spectrumBands[0].color);
        spectrumGradient.addColorStop(1, spectrumBands[0].color);
      } else {
        spectrumBands.forEach((band, index) => {
          spectrumGradient.addColorStop(index / (spectrumBands.length - 1), band.color);
        });
      }
      const peakIntensity = Math.max(...spectrumBands.map((band) => clamp01(band.intensity)));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 + peakIntensity * 0.48;
      ctx.fillStyle = spectrumGradient;
      ctx.fillRect(cx - planetR, cy - planetR, planetR * 2, planetR * 2);
      ctx.restore();
    }

    // --- Power ring: background track -----------------------------------
    const lineWidth = Math.max(3, planetR * 0.18);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();

    // --- Power ring: progress arc, or a steady pulsing ring once satisfied
    if (tier === 'satisfied') {
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = 0.75 + pulse * 0.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const arcFraction = clamp01(ratio);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + arcFraction * Math.PI * 2);
      ctx.strokeStyle = palette.accent;
      ctx.stroke();
    }

    // --- Stabilize ring: fills while the goal is being continuously held --
    if (puzzleState === 'STABILIZING' && stabilizeProgress > 0) {
      const fraction = clamp01(stabilizeProgress);
      ctx.beginPath();
      ctx.lineWidth = Math.max(2, planetR * 0.08);
      ctx.arc(cx, cy, stabilizeRingR, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
    }

    // --- Solved: one brief ripple, not an explosion -----------------------
    if (puzzleState === 'SOLVED' && solvedAtMs !== undefined) {
      const elapsed = nowMs - solvedAtMs;
      if (elapsed >= 0 && elapsed < RIPPLE_DURATION_MS) {
        const t = elapsed / RIPPLE_DURATION_MS;
        const rippleR = ringR + t * planetR * 0.5;
        ctx.beginPath();
        ctx.lineWidth = Math.max(1, planetR * 0.05) * (1 - t);
        ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - t)})`;
        ctx.stroke();
      }
    }
  }
}
