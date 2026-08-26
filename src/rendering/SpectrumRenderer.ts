import type { SpectrumFan } from './spectrumGeometry';

/**
 * Thin wrapper around a full-window <canvas> that draws the refracted
 * spectrum as ONE continuous rainbow-gradient wedge (a conic gradient
 * clipped to the fan's angular sweep), fanning out from the prism's exit
 * point. Phase 4 only — pure canvas drawing, no optics/physics of its own;
 * consumes the already-computed `SpectrumFan` produced by
 * `spectrumGeometry.ts`. Mirrors the `PrismRenderer` conventions in
 * `src/devices/Prism.ts`: full-window canvas sized to
 * window.innerWidth/innerHeight (no DPR scaling), re-sized and re-drawn at
 * the last known value on window resize, no shadowBlur/filter effects
 * (must stay cheap to redraw on every pointermove/wheel tick during a fast
 * drag).
 */
export class SpectrumRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastFan: SpectrumFan | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SpectrumRenderer: 2d context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.drawFan(this.lastFan);
  }

  /**
   * Renders the given fan, or clears the canvas if `fan` is null (e.g. the
   * physics didn't produce a valid spectrum this frame — ray missed the
   * prism, or fewer than 2 wavelengths survived tracing).
   */
  drawFan(fan: SpectrumFan | null): void {
    this.clear();
    this.lastFan = fan;

    if (fan === null || fan.stops.length < 2) return;

    const { ctx, canvas } = this;

    // fan.endAngle is already wraparound-corrected by spectrumGeometry, so
    // the sweep below is guaranteed small and correctly signed — do NOT
    // re-apply any wraparound correction here.
    const sweep = fan.endAngle - fan.startAngle;
    const anticlockwise = sweep < 0;

    // IMPORTANT: createConicGradient's offset is ALWAYS a fraction of one
    // FULL revolution (2π) starting at its reference angle, walking in the
    // direction of INCREASING angle — offset 1 means "all the way around",
    // not "at fan.endAngle". `fan.stops[].offset` (from spectrumGeometry) is
    // only relative to the small physical sweep (fan.startAngle..endAngle),
    // stop[0]=0 (violet) .. stop[last]=1 (red). To land every stop inside
    // the same tiny angular slice we actually draw, the gradient's
    // reference angle must be whichever endpoint the arc walks AWAY FROM in
    // the increasing-angle direction:
    //   - sweep >= 0: the arc's angle increases from startAngle to
    //     endAngle, so reference = startAngle, and each stop's true offset
    //     grows with it (0 at violet .. sweepFraction at red) — no reversal
    //     needed.
    //   - sweep < 0: the arc's angle DECREASES from startAngle to endAngle,
    //     i.e. increases from endAngle up to startAngle. Using startAngle as
    //     the reference here would place the two endpoints on OPPOSITE ends
    //     of the [0,1] range (0 and ~1, wrapping the "long way" around) even
    //     though they're only a few degrees apart, making the gradient
    //     jump straight to the boundary color everywhere except a single
    //     point — reference must be endAngle instead, and the stop order
    //     reverses accordingly (red, at endAngle, becomes offset 0; violet,
    //     at startAngle, becomes offset |sweepFraction|).
    const sweepFraction = Math.abs(sweep) / (2 * Math.PI);
    const refAngle = sweep >= 0 ? fan.startAngle : fan.endAngle;
    const gradient = ctx.createConicGradient(refAngle, fan.apex.x, fan.apex.y);
    for (const stop of fan.stops) {
      const localOffset = Math.min(1, Math.max(0, stop.offset));
      const forwardLocalOffset = sweep >= 0 ? localOffset : 1 - localOffset;
      const trueOffset = Math.min(1, Math.max(0, forwardLocalOffset * sweepFraction));
      gradient.addColorStop(trueOffset, stop.color);
    }

    // Full diagonal — generous, guarantees full coverage from any apex
    // position, including one near a corner.
    const radius = Math.hypot(canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(fan.apex.x, fan.apex.y);
    ctx.arc(fan.apex.x, fan.apex.y, radius, fan.startAngle, fan.endAngle, anticlockwise);
    ctx.closePath();

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
