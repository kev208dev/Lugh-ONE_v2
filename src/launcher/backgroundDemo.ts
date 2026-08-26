/**
 * Purely decorative canvas behind the launcher screen: broad light entering
 * from the left, a small glass prism, a faint spectrum fan drifting out to
 * the right. Deliberately NOT the real optics engine (no src/optics/*,
 * src/devices/*, src/rendering/* imports) — this only has to read as "a
 * light/prism experiment" at a glance behind the UI, cheaply, forever, in a
 * background tab. Colors are hand-picked here rather than sampled via the
 * real wavelength->RGB model for that reason.
 */
const SPECTRUM_HUES = [265, 235, 200, 150, 90, 40, 10];

export class LauncherBackgroundDemo {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private rafHandle: number | undefined;
  private startTime: number | undefined;
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('LauncherBackgroundDemo: 2d context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start(): void {
    if (this.rafHandle !== undefined || document.hidden) return;
    const tick = (t: number): void => {
      if (this.startTime === undefined) this.startTime = t;
      this.draw((t - this.startTime) / 1000);
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafHandle !== undefined) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = undefined;
    }
  }

  private draw(tSec: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.46;
    const cy = h * 0.52;
    const prismSize = Math.min(w, h) * 0.07;

    // Very slow breathing so nothing reads as "busy" behind the UI.
    const breathe = 0.85 + 0.15 * Math.sin(tSec * 0.35);

    // Broad incoming light from off-screen left.
    const beamGradient = ctx.createLinearGradient(-w * 0.2, cy, cx, cy);
    beamGradient.addColorStop(0, `rgba(255,248,230,${0.0})`);
    beamGradient.addColorStop(0.55, `rgba(255,248,230,${0.05 * breathe})`);
    beamGradient.addColorStop(1, `rgba(255,248,230,${0.16 * breathe})`);
    ctx.fillStyle = beamGradient;
    const beamHalfHeight = Math.min(w, h) * 0.05;
    ctx.fillRect(-w * 0.2, cy - beamHalfHeight, cx - -w * 0.2, beamHalfHeight * 2);

    // Small glass prism, gently glinting rather than moving.
    const glintAlpha = 0.35 + 0.15 * Math.sin(tSec * 0.6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -prismSize);
    ctx.lineTo(prismSize * 0.87, prismSize * 0.5);
    ctx.lineTo(-prismSize * 0.87, prismSize * 0.5);
    ctx.closePath();
    const glassGradient = ctx.createLinearGradient(0, -prismSize, 0, prismSize * 0.5);
    glassGradient.addColorStop(0, `rgba(220,235,255,${0.22 + 0.1 * glintAlpha})`);
    glassGradient.addColorStop(1, `rgba(160,190,230,0.08)`);
    ctx.fillStyle = glassGradient;
    ctx.fill();
    ctx.strokeStyle = `rgba(230,240,255,${0.25 + 0.1 * glintAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Faint continuous spectrum fan drifting out to the right.
    const fanOrigin = { x: cx + prismSize * 0.3, y: cy + prismSize * 0.15 };
    const fanLength = Math.min(w, h) * 0.42;
    const spreadDeg = 14;
    const baseAngle = -6 + Math.sin(tSec * 0.15) * 1.5; // barely drifting

    ctx.lineCap = 'round';
    for (let i = 0; i < SPECTRUM_HUES.length; i++) {
      const t = i / (SPECTRUM_HUES.length - 1);
      const angleDeg = baseAngle + (t - 0.5) * spreadDeg;
      const angleRad = (angleDeg * Math.PI) / 180;
      const endX = fanOrigin.x + Math.cos(angleRad) * fanLength;
      const endY = fanOrigin.y + Math.sin(angleRad) * fanLength;

      const rayGradient = ctx.createLinearGradient(fanOrigin.x, fanOrigin.y, endX, endY);
      const hue = SPECTRUM_HUES[i];
      rayGradient.addColorStop(0, `hsla(${hue}, 85%, 70%, ${0.32 * breathe})`);
      rayGradient.addColorStop(1, `hsla(${hue}, 85%, 70%, 0)`);

      ctx.strokeStyle = rayGradient;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fanOrigin.x, fanOrigin.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }
}
