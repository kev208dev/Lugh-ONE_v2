import type { Point } from '../optics/Ray';

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

  drawSegment(local1: Point, local2: Point): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(local1.x, local1.y);
    ctx.lineTo(local2.x, local2.y);

    // Soft beam glow: two wide, low-alpha passes underneath the crisp core,
    // instead of ctx.shadowBlur (cheap, no per-pixel blur cost, and doesn't
    // bleed onto neighboring canvas layers the way shadowBlur can).
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

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
