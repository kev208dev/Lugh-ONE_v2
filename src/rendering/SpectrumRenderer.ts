import type { SpectrumFan } from './spectrumGeometry';
import type { SpectralRay } from '../optics/PrismPhysics';
import { wavelengthToRgb } from '../optics/Spectrum';

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
 * (must stay cheap to redraw on every wheel tick during a fast
 * drag).
 */
export class SpectrumRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastFan: SpectrumFan | null = null;
  private lastRays: SpectralRay[] = [];

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
    this.drawFan(this.lastFan, this.lastRays);
  }

  /**
   * Renders the given fan, or clears the canvas if `fan` is null (e.g. the
   * physics didn't produce a valid spectrum this frame — ray missed the
   * prism, or fewer than 2 wavelengths survived tracing).
   */
  drawFan(fan: SpectrumFan | null, rays: SpectralRay[] = []): void {
    this.clear();
    this.lastFan = fan;
    this.lastRays = rays;

    const { ctx, canvas } = this;

    // The color transformation begins at the glass contact point. Draw the
    // refracted wavelength paths inside the prism so the incoming white beam
    // visibly becomes a spectrum instead of appearing to pass straight
    // through the glass unchanged.
    if (rays.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const ray of rays) {
        const { r, g, b } = wavelengthToRgb(ray.wavelengthNm);
        const color = `rgb(${r},${g},${b})`;
        const internalPath = ray.internalPath?.length
          ? ray.internalPath
          : [ray.entryPoint, ray.exitPoint];
        ctx.beginPath();
        ctx.moveTo(internalPath[0].x, internalPath[0].y);
        for (const point of internalPath.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw every outgoing wavelength independently as a guaranteed visible
    // path. The filled fan below is richer when the rays form one continuous
    // wedge, but individual strokes also cover grazing angles, tiny fan
    // sweeps, and wavelengths that leave through different faces after TIR.
    if (rays.length > 0) {
      const rayLength = Math.hypot(canvas.width, canvas.height) * 1.35;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const ray of rays) {
        const { r, g, b } = wavelengthToRgb(ray.wavelengthNm);
        ctx.beginPath();
        ctx.moveTo(ray.exitPoint.x, ray.exitPoint.y);
        ctx.lineTo(
          ray.exitPoint.x + ray.exitDirection.x * rayLength,
          ray.exitPoint.y + ray.exitDirection.y * rayLength
        );
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (fan !== null && fan.stops.length >= 2) {
      // fan.endAngle is already wraparound-corrected by spectrumGeometry,
      // so the sweep below is guaranteed small and correctly signed.
      const sweep = fan.endAngle - fan.startAngle;
      const anticlockwise = sweep < 0;

      // createConicGradient offsets span a full revolution, while the real
      // spectrum occupies only this small angular sweep. Remap each physical
      // wavelength stop into that fraction and reverse it for a negative
      // sweep so the violet-to-red order never wraps around the long way.
      const sweepFraction = Math.abs(sweep) / (2 * Math.PI);
      const refAngle = sweep >= 0 ? fan.startAngle : fan.endAngle;
      const gradient = ctx.createConicGradient(refAngle, fan.apex.x, fan.apex.y);
      for (const stop of fan.stops) {
        const localOffset = Math.min(1, Math.max(0, stop.offset));
        const forwardLocalOffset = sweep >= 0 ? localOffset : 1 - localOffset;
        const trueOffset = Math.min(1, Math.max(0, forwardLocalOffset * sweepFraction));
        gradient.addColorStop(trueOffset, stop.color);
      }

      const radius = Math.hypot(canvas.width, canvas.height);
      ctx.beginPath();
      ctx.moveTo(fan.apex.x, fan.apex.y);
      ctx.arc(fan.apex.x, fan.apex.y, radius, fan.startAngle, fan.endAngle, anticlockwise);
      ctx.closePath();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.64;
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    }

    if (rays.length > 0) {
      const contact = rays[0].entryPoint;
      const flare = ctx.createRadialGradient(contact.x, contact.y, 0, contact.x, contact.y, 18);
      flare.addColorStop(0, 'rgba(255,255,255,0.95)');
      flare.addColorStop(0.25, 'rgba(210,230,255,0.5)');
      flare.addColorStop(1, 'rgba(127,184,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flare;
      ctx.fillRect(contact.x - 18, contact.y - 18, 36, 36);
      ctx.restore();
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
