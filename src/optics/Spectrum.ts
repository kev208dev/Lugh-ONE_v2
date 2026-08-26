export const SPECTRUM_MIN_NM = 380;
export const SPECTRUM_MAX_NM = 700;
export const SPECTRUM_STEP_NM = 10;

/**
 * Returns the sampled wavelengths in nm, ascending, inclusive of both ends:
 * [380, 390, 400, ..., 700] - exactly 33 values.
 */
export function sampleWavelengths(): number[] {
  const wavelengths: number[] = [];
  for (let nm = SPECTRUM_MIN_NM; nm <= SPECTRUM_MAX_NM; nm += SPECTRUM_STEP_NM) {
    wavelengths.push(nm);
  }
  return wavelengths;
}

/**
 * Wavelength-dependent refractive index via the Cauchy equation:
 *   n(lambda) = A + B / lambda_um^2
 * where lambda_um = wavelengthNm / 1000. Default A=1.5046, B=0.0042
 * approximate a crown-glass-like dispersion (n(400nm) ~= 1.531,
 * n(700nm) ~= 1.513 - about a 0.018 spread across the visible range).
 * Strictly DECREASING as wavelength increases, since B > 0.
 */
export function refractiveIndex(wavelengthNm: number, A = 1.5046, B = 0.0042): number {
  const lambdaUm = wavelengthNm / 1000;
  return A + B / (lambdaUm * lambdaUm);
}

/**
 * Approximate visible-wavelength → RGB color, using the classic
 * Dan Bruton "Color Science" piecewise-linear approximation. Returns
 * integer 0-255 channel values.
 */
export function wavelengthToRgb(wavelengthNm: number): { r: number; g: number; b: number } {
  const w = wavelengthNm;
  let r = 0,
    g = 0,
    b = 0;

  if (w >= 380 && w < 440) {
    r = -(w - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (w >= 440 && w < 490) {
    r = 0;
    g = (w - 440) / (490 - 440);
    b = 1;
  } else if (w >= 490 && w < 510) {
    r = 0;
    g = 1;
    b = -(w - 510) / (510 - 490);
  } else if (w >= 510 && w < 580) {
    r = (w - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (w >= 580 && w < 645) {
    r = 1;
    g = -(w - 645) / (645 - 580);
    b = 0;
  } else if (w >= 645 && w <= 700) {
    r = 1;
    g = 0;
    b = 0;
  }

  let factor: number;
  if (w >= 380 && w < 420) {
    factor = 0.3 + (0.7 * (w - 380)) / (420 - 380);
  } else if (w >= 420 && w < 701) {
    factor = 1.0;
  } else {
    factor = 0.0;
  }

  const gamma = 0.8;
  const adjust = (c: number): number => (c === 0 ? 0 : Math.round(255 * Math.pow(c * factor, gamma)));

  return { r: adjust(r), g: adjust(g), b: adjust(b) };
}
