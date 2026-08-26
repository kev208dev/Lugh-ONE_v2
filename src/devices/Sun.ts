/**
 * Thin wrapper around a full-window <canvas> that draws a static sun disc
 * with a soft outer glow. Sun has no dynamic state (no rotation, no
 * variable power/angle like Prism or a receiver), so `draw()` takes no
 * parameters and is simply re-invoked at the new canvas size on resize.
 * Pure visual polish — no physics, no geometry shared with optics tracing.
 */
export class SunRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SunRenderer: 2d context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.draw();
  }

  /** Draws the sun. No parameters — the sun is static. */
  draw(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.22;

    // Soft outer glow, painted first so the solid disc sits on top of it.
    const glowRadius = radius * 2.2;
    const glowGradient = ctx.createRadialGradient(
      cx,
      cy,
      radius * 0.6,
      cx,
      cy,
      glowRadius
    );
    glowGradient.addColorStop(0, 'rgba(255,220,120,0.55)');
    glowGradient.addColorStop(0.5, 'rgba(255,170,60,0.22)');
    glowGradient.addColorStop(1, 'rgba(255,140,40,0)');

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Solid sun disc, with the inner gradient origin offset slightly
    // up-left for a subtle lit-sphere look.
    const discGradient = ctx.createRadialGradient(
      cx - radius * 0.25,
      cy - radius * 0.25,
      radius * 0.05,
      cx,
      cy,
      radius
    );
    discGradient.addColorStop(0, '#fff8e0');
    discGradient.addColorStop(0.4, '#ffd76a');
    discGradient.addColorStop(0.75, '#ffa832');
    discGradient.addColorStop(1, '#ff8a1e');

    ctx.fillStyle = discGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
