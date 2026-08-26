import { describe, expect, it, vi } from 'vitest';
import { ReceiverPlanetRenderer } from '../src/devices/ReceiverPlanet';

describe('ReceiverPlanetRenderer spectrum projection', () => {
  it('projects the received wavelength colors onto the planet body', () => {
    const spectrumGradient = { addColorStop: vi.fn() };
    const bodyGradient = { addColorStop: vi.fn() };
    const ctx = {
      clearRect: vi.fn(),
      createRadialGradient: vi.fn(() => bodyGradient),
      createLinearGradient: vi.fn(() => spectrumGradient),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      lineWidth: 1,
      lineCap: 'butt'
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx)
    } as unknown as HTMLCanvasElement;
    const renderer = new ReceiverPlanetRenderer(canvas, 'earth');

    renderer.draw(
      {
        percent: 70,
        goalMinPower: 55,
        puzzleState: 'PLAYING',
        stabilizeProgress: 0,
        spectrumBands: [
          { color: 'rgb(100,0,255)', intensity: 1 },
          { color: 'rgb(0,180,255)', intensity: 0.9 },
          { color: 'rgb(255,30,0)', intensity: 0.8 }
        ]
      },
      0
    );

    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1);
    expect(spectrumGradient.addColorStop).toHaveBeenNthCalledWith(1, 0, 'rgb(100,0,255)');
    expect(spectrumGradient.addColorStop).toHaveBeenNthCalledWith(2, 0.5, 'rgb(0,180,255)');
    expect(spectrumGradient.addColorStop).toHaveBeenNthCalledWith(3, 1, 'rgb(255,30,0)');
    expect(ctx.clip).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
  });
});
