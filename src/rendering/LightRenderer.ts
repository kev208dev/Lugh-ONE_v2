import type { Point } from '../optics/Ray';

/**
 * Thin wrapper around a full-window <canvas> (see .ray-canvas in style.css)
 * that draws a single 1px white line segment in the canvas's own local
 * coordinate space. Phase 1 only — no glow/gradient/spectrum, no DPR scaling.
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
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(local1.x, local1.y);
    ctx.lineTo(local2.x, local2.y);
    ctx.stroke();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
