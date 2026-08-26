import { beforeEach, describe, expect, it, vi } from 'vitest';
import { level01 } from '../src/level/levels/level01';
import { level04 } from '../src/level/levels/level04';
import type { BusMessage, DeviceId, WindowGeometry } from '../src/runtime/types';

const mocks = vi.hoisted(() => ({
  level: null as unknown,
  handler: undefined as ((message: BusMessage) => void) | undefined,
  drawSegment: vi.fn(),
  clear: vi.fn()
}));

vi.mock('../src/level/session', () => ({
  currentLevel: () => mocks.level
}));

vi.mock('../src/devices/Sun', () => ({
  SunRenderer: vi.fn()
}));

vi.mock('../src/rendering/LightRenderer', () => ({
  LightRenderer: vi.fn(() => ({
    drawSegment: mocks.drawSegment,
    clear: mocks.clear
  }))
}));

vi.mock('../src/pages/deviceBootstrap', () => ({
  bootstrapDevicePage: vi.fn(
    (_id: DeviceId, opts: { onSelfUpdate?: (geometry: WindowGeometry) => void }) => {
      opts.onSelfUpdate?.(geometry('sun', 0));
      return {
        bus: {
          subscribe(handler: (message: BusMessage) => void) {
            mocks.handler = handler;
            return () => undefined;
          }
        }
      };
    }
  )
}));

function geometry(id: DeviceId, screenX: number): WindowGeometry {
  return {
    id,
    screenX,
    screenY: 0,
    outerWidth: 260,
    outerHeight: 260,
    innerWidth: 240,
    innerHeight: 220,
    chromeInsetTop: 40,
    chromeInsetLeft: 10,
    timestamp: 0
  };
}

async function loadSunPage(): Promise<void> {
  document.body.innerHTML = '<canvas id="sun-canvas"></canvas><canvas id="ray-canvas"></canvas>';
  await import('../src/pages/sun');
  expect(mocks.handler).toBeTypeOf('function');
}

describe('SUN outgoing route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.level = null;
    mocks.handler = undefined;
  });

  it('targets PRISM when the level skips MIRROR and BLACKHOLE', async () => {
    mocks.level = level01;
    await loadSunPage();

    mocks.handler?.({ type: 'geometry-update', geometry: geometry('mirror', 300) });
    expect(mocks.drawSegment).not.toHaveBeenCalled();

    mocks.handler?.({ type: 'geometry-update', geometry: geometry('prism', 500) });
    expect(mocks.drawSegment).toHaveBeenCalledTimes(1);
  });

  it('targets BLACKHOLE when it is the first active instrument', async () => {
    mocks.level = level04;
    await loadSunPage();

    mocks.handler?.({ type: 'geometry-update', geometry: geometry('prism', 500) });
    expect(mocks.drawSegment).not.toHaveBeenCalled();

    mocks.handler?.({ type: 'geometry-update', geometry: geometry('blackhole', 300) });
    expect(mocks.drawSegment).toHaveBeenCalledTimes(1);
  });

  it('preserves MIRROR as the direct-page fallback without a level', async () => {
    await loadSunPage();

    mocks.handler?.({ type: 'geometry-update', geometry: geometry('mirror', 300) });
    expect(mocks.drawSegment).toHaveBeenCalledTimes(1);
  });
});
