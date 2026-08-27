export interface PopupDimensions {
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
}

export function popupDimensions(win: Window): PopupDimensions {
  return {
    outerWidth: win.outerWidth,
    outerHeight: win.outerHeight,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight
  };
}

/** Detects maximize/F11-style enlargement while allowing small browser-
 * chrome and OS rounding differences around the launch size. */
export function isPopupOversized(
  baseline: PopupDimensions,
  current: PopupDimensions,
  tolerancePx = 80
): boolean {
  const exceeds = (initial: number, value: number) =>
    value > Math.max(initial + tolerancePx, initial * 1.35);
  return (
    exceeds(baseline.outerWidth, current.outerWidth) ||
    exceeds(baseline.outerHeight, current.outerHeight) ||
    exceeds(baseline.innerWidth, current.innerWidth) ||
    exceeds(baseline.innerHeight, current.innerHeight)
  );
}
