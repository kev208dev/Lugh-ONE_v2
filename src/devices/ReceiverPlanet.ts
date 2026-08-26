export type PlanetTheme = 'earth' | 'mars';

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
 * Thin wrapper around a full-window <canvas> that draws a receiver planet
 * (Earth or Mars) with a progress ring reflecting the current receiver
 * power percentage, plus a soft achievement glow once the level is
 * complete. Mirrors the PrismRenderer convention: sizes to the window,
 * re-sizes on `window resize`, and re-draws at the last known state after
 * a resize so content never vanishes. Pure canvas 2d rendering only — no
 * shadowBlur, no filter, no compositeOperation changes — so it stays cheap
 * to redraw on every `level-state` message.
 */
export class ReceiverPlanetRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: PlanetTheme;
  private lastPercent = 0;
  private lastComplete = false;

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
    this.draw(this.lastPercent, this.lastComplete);
  }

  /** Draws the planet + a progress ring reflecting the current receiver power. */
  draw(percent: number, complete: boolean): void {
    this.lastPercent = percent;
    this.lastComplete = complete;

    const p = Math.min(100, Math.max(0, percent));
    const { ctx, canvas, theme } = this;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const planetR = Math.min(canvas.width, canvas.height) * 0.16;
    const ringR = planetR * 1.6;

    const palette = PALETTES[theme];

    // Planet body.
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

    // Progress ring: background track.
    const lineWidth = Math.max(3, planetR * 0.18);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();

    // Progress ring: progress arc.
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + (p / 100) * Math.PI * 2);
    ctx.strokeStyle = palette.accent;
    ctx.stroke();

    // Achievement glow once the level is complete.
    if (complete) {
      const glowGradient = ctx.createRadialGradient(cx, cy, ringR * 0.9, cx, cy, ringR * 1.6);
      glowGradient.addColorStop(0, 'rgba(255,225,120,0)');
      glowGradient.addColorStop(0.4, 'rgba(255,225,120,0.5)');
      glowGradient.addColorStop(1, 'rgba(255,225,120,0)');

      ctx.beginPath();
      ctx.arc(cx, cy, ringR * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();
    }
  }
}
