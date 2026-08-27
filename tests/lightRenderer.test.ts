import { describe, expect, it, vi } from 'vitest';
import { LightRenderer } from '../src/rendering/LightRenderer';

function makeCanvas() {
  const strokeColors: string[] = [];
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineWidth: 1,
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
  return { canvas, ctx, strokeColors };
}

describe('LightRenderer spectral output', () => {
  it('draws every wavelength color as its own beam instead of averaging them', () => {
    const { canvas, ctx, strokeColors } = makeCanvas();
    const renderer = new LightRenderer(canvas);

    renderer.drawSpectralSegments([
      { start: { x: 0, y: 10 }, end: { x: 100, y: 12 }, color: 'rgb(100,0,255)', intensity: 1 },
      { start: { x: 0, y: 20 }, end: { x: 100, y: 24 }, color: 'rgb(255,30,0)', intensity: 0.8 }
    ]);

    expect(strokeColors).toContain('rgb(100,0,255)');
    expect(strokeColors).toContain('rgb(255,30,0)');
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(6);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  });

  it('draws a shared sampled path as one continuous glowing beam', () => {
    const { canvas, ctx } = makeCanvas();
    const renderer = new LightRenderer(canvas);

    renderer.drawPath([
      { x: 0, y: 10 },
      { x: 50, y: 18 },
      { x: 100, y: 40 }
    ]);

    expect(ctx.moveTo).toHaveBeenCalledWith(0, 10);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 50, 18);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 100, 40);
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });
});
