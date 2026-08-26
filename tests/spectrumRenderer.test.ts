import { describe, expect, it, vi } from 'vitest';
import { SpectrumRenderer } from '../src/rendering/SpectrumRenderer';
import { buildSpectrumFan } from '../src/rendering/spectrumGeometry';
import type { SpectralRay } from '../src/optics/PrismPhysics';

function direction(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

describe('SpectrumRenderer prism contact', () => {
  it('draws colored paths inside the prism and a contact flare at the white-light hit point', () => {
    const conicGradient = { addColorStop: vi.fn() };
    const radialGradient = { addColorStop: vi.fn() };
    const strokeColors: string[] = [];
    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      createConicGradient: vi.fn(() => conicGradient),
      createRadialGradient: vi.fn(() => radialGradient),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      lineCap: 'butt',
      lineWidth: 1,
      fillStyle: '',
      set strokeStyle(value: string) {
        strokeColors.push(value);
      },
      get strokeStyle() {
        return strokeColors.at(-1) ?? '#000000';
      }
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx)
    } as unknown as HTMLCanvasElement;
    const rays: SpectralRay[] = [
      {
        wavelengthNm: 400,
        intensity: 1,
        entryPoint: { x: 40, y: 80 },
        internalDirection: direction(5),
        exitPoint: { x: 100, y: 84 },
        exitDirection: direction(8)
      },
      {
        wavelengthNm: 700,
        intensity: 1,
        entryPoint: { x: 40, y: 80 },
        internalDirection: direction(6),
        exitPoint: { x: 100, y: 86 },
        exitDirection: direction(12)
      }
    ];
    const renderer = new SpectrumRenderer(canvas);

    renderer.drawFan(buildSpectrumFan(rays), rays);

    expect(new Set(strokeColors).size).toBeGreaterThanOrEqual(2);
    expect(ctx.moveTo).toHaveBeenCalledWith(40, 80);
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(40, 80, 0, 40, 80, 18);
    expect(ctx.fillRect).toHaveBeenCalledWith(22, 62, 36, 36);
  });
});
