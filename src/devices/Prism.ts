import type { Point } from '../optics/Ray';

/**
 * Computes the 3 vertices of the equilateral triangle used to represent the
 * prism, centered at (canvasWidth/2, canvasHeight/2), with circumradius
 * `Math.min(canvasWidth, canvasHeight) * 0.28`, rotated by `angleDeg` degrees
 * about its own center. Base vertex angles are -90/30/150 degrees (i.e. one
 * vertex pointing straight up at angleDeg = 0).
 *
 * Extracted so both PrismRenderer (drawing) and the Phase 3 physics wiring
 * (tracing) share the exact same geometry, with no risk of drift between
 * what's drawn and what's physically traced.
 */
export function computePrismVertices(
  canvasWidth: number,
  canvasHeight: number,
  angleDeg: number
): [Point, Point, Point] {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const radius = Math.min(canvasWidth, canvasHeight) * 0.28;
  const angleRad = (angleDeg * Math.PI) / 180;

  const baseAnglesDeg = [-90, 30, 150];
  const vertices = baseAnglesDeg.map((baseDeg) => {
    const vertexAngle = (baseDeg * Math.PI) / 180 + angleRad;
    return {
      x: centerX + radius * Math.cos(vertexAngle),
      y: centerY + radius * Math.sin(vertexAngle),
    };
  }) as [Point, Point, Point];

  return vertices;
}

/**
 * Thin wrapper around a full-window <canvas> (see .overlay-canvas in
 * style.css / #prism-canvas in prism.html) that draws an equilateral
 * triangle outline, rotated about its own center, in the canvas's own
 * local coordinate space. Phase 2 only — pure shape rendering, no
 * spectrum/optical physics, no DPR scaling, no blur/filter effects
 * (must stay cheap to redraw on every pointermove during a drag).
 */
export class PrismRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastAngleDeg = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PrismRenderer: 2d context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.drawPrism(this.lastAngleDeg);
  }

  /** Renders the prism at the given rotation, in degrees, about its own center. */
  drawPrism(angleDeg: number): void {
    this.lastAngleDeg = angleDeg;

    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const vertices = computePrismVertices(canvas.width, canvas.height, angleDeg);

    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    ctx.lineTo(vertices[1].x, vertices[1].y);
    ctx.lineTo(vertices[2].x, vertices[2].y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(200, 220, 255, 0.04)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(200, 220, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
