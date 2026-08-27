import { describe, expect, it } from 'vitest';
import { isPopupOversized, type PopupDimensions } from '../src/runtime/PopupGuard';

describe('popup fullscreen guard', () => {
  const baseline: PopupDimensions = {
    outerWidth: 260,
    outerHeight: 260,
    innerWidth: 244,
    innerHeight: 220
  };

  it('allows small browser and OS size differences', () => {
    expect(isPopupOversized(baseline, { ...baseline, outerWidth: 300, innerHeight: 250 })).toBe(false);
  });

  it('rejects a maximized or fullscreen device window', () => {
    expect(
      isPopupOversized(baseline, {
        outerWidth: 1920,
        outerHeight: 1080,
        innerWidth: 1920,
        innerHeight: 1040
      })
    ).toBe(true);
  });
});
