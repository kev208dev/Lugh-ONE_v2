import { sampleWavelengths } from './Spectrum';

export type ReceiverId = 'earth' | 'mars';

export interface ReceiverRange {
  minNm: number;
  maxNm: number;
}

/** EARTH: blue/cyan/green sensitivity, 430-560nm. MARS: warm/red-orange
 * sensitivity, 580-700nm. Per the project's design spec - do not deviate. */
export const RECEIVER_RANGES: Record<ReceiverId, ReceiverRange> = {
  earth: { minNm: 430, maxNm: 560 },
  mars: { minNm: 580, maxNm: 700 }
};

/**
 * Smooth spectral sensitivity for a receiver at a given wavelength, using a
 * raised-cosine (Hann-window-shaped) curve: 0 at both edges of the
 * receiver's range, rising smoothly to a peak of 1 exactly at the range's
 * midpoint, and 0 for any wavelength outside the range entirely. This is
 * deliberately NOT a hard on/off rectangle - it's meant to feel like a real
 * sensor response, not a binary "in range = full power" cutoff.
 */
export function receiverResponse(id: ReceiverId, wavelengthNm: number): number {
  const { minNm, maxNm } = RECEIVER_RANGES[id];
  if (wavelengthNm < minNm || wavelengthNm > maxNm) return 0;
  const t = (wavelengthNm - minNm) / (maxNm - minNm); // 0 at minNm, 1 at maxNm
  return 0.5 * (1 - Math.cos(2 * Math.PI * t));
}

/**
 * Sum of receiverResponse(id, λ) over EVERY sampled wavelength (from
 * sampleWavelengths(), 380..700nm step 10 - 33 values). This is the
 * normalization denominator a caller uses to turn a raw summed power into a
 * 0-100% figure: percent = 100 * actualPower / receiverMaxResponseSum(id),
 * where actualPower is itself Σ (intensity_i * receiverResponse(id, λ_i))
 * over whichever wavelengths actually reach the receiver. This represents
 * "the power this receiver WOULD get if literally every sampled wavelength
 * arrived here at full intensity 1" - the theoretical maximum.
 */
export function receiverMaxResponseSum(id: ReceiverId): number {
  let sum = 0;
  for (const wavelengthNm of sampleWavelengths()) {
    sum += receiverResponse(id, wavelengthNm);
  }
  return sum;
}
