import { describe, it, expect } from 'vitest';
import { wavelengthToRgb, sampleWavelengths } from '../src/optics/Spectrum';

describe('wavelengthToRgb', () => {
  it('renders 700nm (deep red) with a high red channel and near-zero green/blue', () => {
    const { r, g, b } = wavelengthToRgb(700);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThanOrEqual(5);
    expect(b).toBeLessThanOrEqual(5);
  });

  it('renders 450nm (blue) with a high blue channel and low red', () => {
    const { r, b } = wavelengthToRgb(450);
    expect(b).toBeGreaterThan(200);
    expect(r).toBeLessThan(50);
  });

  it('renders 510nm (green) with a high green channel and low red/blue', () => {
    const { r, g, b } = wavelengthToRgb(510);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(50);
    expect(b).toBeLessThan(50);
  });

  it('returns integer channels in [0, 255] for every sampled wavelength, never NaN', () => {
    for (const nm of sampleWavelengths()) {
      const { r, g, b } = wavelengthToRgb(nm);
      for (const c of [r, g, b]) {
        expect(Number.isInteger(c)).toBe(true);
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });

  it('has a sane, non-inverted red ramp: essentially 0 at 450nm and essentially 255 at 650nm+', () => {
    expect(wavelengthToRgb(450).r).toBeLessThanOrEqual(5);
    expect(wavelengthToRgb(650).r).toBeGreaterThanOrEqual(250);
    expect(wavelengthToRgb(700).r).toBeGreaterThanOrEqual(250);
  });
});
