import { describe, it, expect } from 'vitest';
import { sampleWavelengths } from '../src/optics/Spectrum';
import {
  RECEIVER_RANGES,
  receiverResponse,
  receiverMaxResponseSum,
  type ReceiverId
} from '../src/optics/Receiver';

describe('RECEIVER_RANGES', () => {
  it('locks in the spec-defined ranges', () => {
    expect(RECEIVER_RANGES.earth).toEqual({ minNm: 430, maxNm: 560 });
    expect(RECEIVER_RANGES.mars).toEqual({ minNm: 580, maxNm: 700 });
  });
});

describe('receiverResponse', () => {
  it('peaks at ~1 at the midpoint of the earth range (495nm)', () => {
    expect(receiverResponse('earth', 495)).toBeCloseTo(1, 9);
  });

  it('is ~0 at the exact edges of the earth range', () => {
    expect(receiverResponse('earth', 430)).toBeCloseTo(0, 9);
    expect(receiverResponse('earth', 560)).toBeCloseTo(0, 9);
  });

  it('is exactly 0 clearly outside the earth range', () => {
    expect(receiverResponse('earth', 400)).toBe(0);
    expect(receiverResponse('earth', 600)).toBe(0);
  });

  it('peaks at ~1 at the midpoint of the mars range (640nm)', () => {
    expect(receiverResponse('mars', 640)).toBeCloseTo(1, 9);
  });

  it('is ~0 at the exact edges of the mars range', () => {
    expect(receiverResponse('mars', 580)).toBeCloseTo(0, 9);
    expect(receiverResponse('mars', 700)).toBeCloseTo(0, 9);
  });

  it('is exactly 0 clearly outside the mars range', () => {
    expect(receiverResponse('mars', 400)).toBe(0);
    expect(receiverResponse('mars', 560)).toBe(0);
  });

  it('never returns a value outside [0, 1] for any sampled wavelength, for either receiver', () => {
    const ids: ReceiverId[] = ['earth', 'mars'];
    for (const id of ids) {
      for (const wavelengthNm of sampleWavelengths()) {
        const response = receiverResponse(id, wavelengthNm);
        expect(response).toBeGreaterThanOrEqual(0);
        expect(response).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('receiverMaxResponseSum', () => {
  it('is positive for both receivers', () => {
    expect(receiverMaxResponseSum('earth')).toBeGreaterThan(0);
    expect(receiverMaxResponseSum('mars')).toBeGreaterThan(0);
  });

  it('matches an independently hand-computed raised-cosine sum for earth', () => {
    const { minNm, maxNm } = RECEIVER_RANGES.earth;
    let expected = 0;
    for (const wavelengthNm of sampleWavelengths()) {
      if (wavelengthNm < minNm || wavelengthNm > maxNm) continue;
      const t = (wavelengthNm - minNm) / (maxNm - minNm);
      expected += 0.5 * (1 - Math.cos(2 * Math.PI * t));
    }
    expect(receiverMaxResponseSum('earth')).toBeCloseTo(expected, 9);
  });

  it('matches an independently hand-computed raised-cosine sum for mars', () => {
    const { minNm, maxNm } = RECEIVER_RANGES.mars;
    let expected = 0;
    for (const wavelengthNm of sampleWavelengths()) {
      if (wavelengthNm < minNm || wavelengthNm > maxNm) continue;
      const t = (wavelengthNm - minNm) / (maxNm - minNm);
      expected += 0.5 * (1 - Math.cos(2 * Math.PI * t));
    }
    expect(receiverMaxResponseSum('mars')).toBeCloseTo(expected, 9);
  });

  it('falls within a sane numeric range given ~13-14 sampled points in range', () => {
    expect(receiverMaxResponseSum('earth')).toBeGreaterThan(0);
    expect(receiverMaxResponseSum('earth')).toBeLessThan(20);
    expect(receiverMaxResponseSum('mars')).toBeGreaterThan(0);
    expect(receiverMaxResponseSum('mars')).toBeLessThan(20);
  });
});
