import { afterEach, describe, expect, it, vi } from 'vitest';
import { WindowManager } from '../src/runtime/WindowManager';

describe('WindowManager popup lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('closes every remaining device when any one device is closed', () => {
    vi.useFakeTimers();
    const onUnexpectedClose = vi.fn();
    const manager = new WindowManager(onUnexpectedClose);
    const survivor = { closed: false, close: vi.fn() } as unknown as Window;
    const alreadyClosed = { closed: true, close: vi.fn() } as unknown as Window;

    (manager as unknown as { registry: Map<string, Window>; startPolling(): void }).registry = new Map([
      ['sun', alreadyClosed],
      ['prism', survivor]
    ]);
    (manager as unknown as { startPolling(): void }).startPolling();
    vi.advanceTimersByTime(500);

    expect(survivor.close).toHaveBeenCalledOnce();
    expect(onUnexpectedClose).toHaveBeenCalledOnce();
  });
});
