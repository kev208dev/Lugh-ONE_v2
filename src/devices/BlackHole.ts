import blackHoleImageUrl from '../assets/blackhole.png';

/**
 * Thin wrapper around a full-window <canvas> that draws a static black hole:
 * an outer accretion-glow, a thin bright photon ring, and a solid near-black
 * event-horizon disc on top. Like SunRenderer, the black hole has no dynamic
 * state (no rotation, no variable power/angle), so `draw()` takes no
 * parameters and is simply re-invoked at the new canvas size on resize.
 * Pure visual polish — no physics, no geometry shared with optics tracing
 * (this file deliberately does not import BlackHolePhysics.ts; the visual
 * event-horizon radius here is a rendering constant only, not required to
 * numerically match DEFAULT_BLACK_HOLE_CONFIG.eventHorizonRadius).
 */
export class BlackHoleRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: HTMLImageElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('BlackHoleRenderer: 2d context unavailable');
    this.ctx = ctx;
    this.image = new Image();
    this.image.addEventListener('load', () => this.draw());
    this.image.src = blackHoleImageUrl;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.draw();
  }

  /** Draws the black hole. No parameters — the black hole is static. */
  draw(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const horizonR = Math.min(canvas.width, canvas.height) * 0.1;

    if (this.image.complete && this.image.naturalWidth > 0) {
      const maxWidth = canvas.width * 0.94;
      const maxHeight = canvas.height * 0.72;
      const scale = Math.min(maxWidth / this.image.naturalWidth, maxHeight / this.image.naturalHeight);
      const width = this.image.naturalWidth * scale;
      const height = this.image.naturalHeight * scale;
      ctx.drawImage(this.image, cx - width / 2, cy - height / 2, width, height);
      return;
    }

    // Loading fallback, replaced by the supplied PNG once decoded.
    const glowGradient = ctx.createRadialGradient(
      cx,
      cy,
      horizonR * 0.8,
      cx,
      cy,
      horizonR * 3.5
    );
    glowGradient.addColorStop(0, 'rgba(180,140,255,0.5)');
    glowGradient.addColorStop(0.35, 'rgba(120,80,220,0.28)');
    glowGradient.addColorStop(0.7, 'rgba(60,30,120,0.12)');
    glowGradient.addColorStop(1, 'rgba(30,10,60,0)');

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, horizonR * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Thin bright photon ring, just outside the horizon.
    ctx.strokeStyle = 'rgba(220,200,255,0.8)';
    ctx.lineWidth = Math.max(1.5, horizonR * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, horizonR * 1.15, 0, Math.PI * 2);
    ctx.stroke();

    // Event horizon itself: solid near-black disc on top of everything.
    ctx.fillStyle = '#050208';
    ctx.beginPath();
    ctx.arc(cx, cy, horizonR, 0, Math.PI * 2);
    ctx.fill();
  }
}
