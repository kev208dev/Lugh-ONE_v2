import type { Point } from '../optics/Ray';
import type { MirrorSurface } from '../optics/MirrorPhysics';

/**
 * Computes the mirror's reflective line segment, centered at
 * (canvasWidth/2, canvasHeight/2), with half-length
 * `Math.min(canvasWidth, canvasHeight) * 0.28`, rotated by `angleDeg`
 * degrees about its own center. At angleDeg = 0 the segment is vertical
 * (running straight up/down through the center); positive angleDeg rotates
 * it clockwise (matching computePrismVertices's angle convention).
 *
 * Extracted so both MirrorRenderer (drawing) and the physics wiring
 * (tracing, via reflectRay's `MirrorSurface` param) share the exact same
 * geometry, with no risk of drift between what's drawn and what's
 * physically traced.
 */
export function computeMirrorSurface(
  canvasWidth: number,
  canvasHeight: number,
  angleDeg: number
): MirrorSurface {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const halfLength = Math.min(canvasWidth, canvasHeight) * 0.28;
  const angleRad = (angleDeg * Math.PI) / 180;

  const dx = Math.sin(angleRad) * halfLength;
  const dy = -Math.cos(angleRad) * halfLength;

  const a: Point = { x: centerX - dx, y: centerY - dy };
  const b: Point = { x: centerX + dx, y: centerY + dy };

  return { a, b };
}

/**
 * Thin wrapper around a full-window <canvas> (see .overlay-canvas in
 * style.css / a #mirror-canvas in mirror.html, mirroring how PrismRenderer
 * is wired to #prism-canvas) that draws the mirror's reflective line
 * segment, rotated about its own center, in the canvas's own local
 * coordinate space. Pure shape rendering only, no optical physics, no DPR
 * scaling, no blur/filter effects (must stay cheap to redraw on every
 * pointermove during a drag).
 */
export class MirrorRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastAngleDeg = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MirrorRenderer: 2d context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.drawMirror(this.lastAngleDeg);
  }

  /** Renders the mirror at the given rotation, in degrees, about its own center. */
  drawMirror(angleDeg: number): void {
    this.lastAngleDeg = angleDeg;

    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const surface = computeMirrorSurface(canvas.width, canvas.height, angleDeg);

    ctx.beginPath();
    ctx.moveTo(surface.a.x, surface.a.y);
    ctx.lineTo(surface.b.x, surface.b.y);

    ctx.strokeStyle = 'rgba(220, 226, 235, 0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
