import { describe, it, expect } from 'vitest';
import { sampleWavelengths, refractiveIndex } from '../src/optics/Spectrum';

describe('sampleWavelengths', () => {
  it('returns exactly 33 values, strictly ascending, 380..700 step 10', () => {
    const wavelengths = sampleWavelengths();
    expect(wavelengths.length).toBe(33);
    expect(wavelengths[0]).toBe(380);
    expect(wavelengths[wavelengths.length - 1]).toBe(700);

    for (let i = 1; i < wavelengths.length; i++) {
      expect(wavelengths[i]).toBeGreaterThan(wavelengths[i - 1]);
      expect(wavelengths[i] - wavelengths[i - 1]).toBe(10);
    }
  });
});

describe('refractiveIndex', () => {
  it('is strictly decreasing as wavelength increases across the sampled range', () => {
    const wavelengths = sampleWavelengths();
    for (let i = 1; i < wavelengths.length; i++) {
      const a = wavelengths[i - 1];
      const b = wavelengths[i];
      expect(refractiveIndex(a)).toBeGreaterThan(refractiveIndex(b));
    }
  });

  it('has a meaningful (non-trivial) dispersion spread between 400nm and 700nm', () => {
    const n400 = refractiveIndex(400);
    const n700 = refractiveIndex(700);
    expect(n400 - n700).toBeGreaterThan(0.01);
  });

  it('returns finite indices in a plausible glass range (1.4 - 1.7) across the sampled range', () => {
    for (const nm of sampleWavelengths()) {
      const n = refractiveIndex(nm);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(1.4);
      expect(n).toBeLessThan(1.7);
    }
  });
});
