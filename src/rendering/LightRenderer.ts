import type { Point } from '../optics/Ray';

export interface ColoredBeamSegment {
  start: Point;
  end: Point;
  color: string;
  intensity?: number;
}

/**
 * Thin wrapper around a full-window <canvas> (see .ray-canvas in style.css)
 * that draws a single white line segment in the canvas's own local
 * coordinate space, with a soft beam glow (two extra wide, low-alpha
 * strokes underneath the crisp 1px core — cheap, no shadowBlur/filter) as
 * visual polish on top of the original Phase 1 behavior. No DPR scaling.
 */
export class LightRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('LightRenderer: 2d context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /** Draws a smooth curved beam from `local1` to `local2`, bowing through
   * `control` (a quadratic-bezier control point) — used for a gravitational
   * "wrap around" look near a black hole, instead of a sharp straight kink.
   * Same glow styling as drawSegment. */
  drawCurveSegment(local1: Point, control: Point, local2: Point): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(local1.x, local1.y);
    ctx.quadraticCurveTo(control.x, control.y, local2.x, local2.y);

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Draws a sampled continuous beam path. This is used when one optical
   * curve spans multiple popup windows, where a single shared list of points
   * avoids a tangent discontinuity at each window boundary. */
  drawPath(points: Point[], color = '#ffffff'): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** `color` defaults to white; pass a spectral color (e.g. from
   * wavelengthToRgb) to tint a beam that's carrying real dispersed light —
   * used by EARTH/MARS so the incoming beam reads as "the same light that
   * left the prism" rather than a generic white line. Glow layers use
   * ctx.globalAlpha rather than parsing the color string, so any CSS color
   * format works. */
  drawSegment(local1: Point, local2: Point, color = '#ffffff'): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(local1.x, local1.y);
    ctx.lineTo(local2.x, local2.y);

    // Soft beam glow: two wide, low-alpha passes underneath the crisp core,
    // instead of ctx.shadowBlur (cheap, no per-pixel blur cost, and doesn't
    // bleed onto neighboring canvas layers the way shadowBlur can).
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Draws the individual wavelength rays that make up dispersed light.
   * The canvas is cleared once, then every band is composited additively so
   * violet through red remain visibly distinct instead of being reduced to
   * a single average RGB line. */
  drawSpectralSegments(segments: ColoredBeamSegment[]): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (segments.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (const segment of segments) {
      const intensity = Math.min(1, Math.max(0, segment.intensity ?? 1));
      if (intensity <= 0) continue;

      ctx.beginPath();
      ctx.moveTo(segment.start.x, segment.start.y);
      ctx.lineTo(segment.end.x, segment.end.y);
      ctx.strokeStyle = segment.color;
      ctx.globalAlpha = 0.08 + intensity * 0.1;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.globalAlpha = 0.18 + intensity * 0.22;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 0.5 + intensity * 0.5;
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }

    ctx.restore();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
