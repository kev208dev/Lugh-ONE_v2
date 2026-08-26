import { describe, it, expect } from 'vitest';
import { clipSegmentToRect, segmentIntersectsCircle } from '../src/optics/Ray';
import type { Point, Rect } from '../src/optics/Ray';

const EPS = 1e-9;

function expectPointClose(actual: Point, expected: Point, eps = EPS) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(eps);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(eps);
}

describe('clipSegmentToRect', () => {
  const rect: Rect = { left: 100, top: 100, width: 200, height: 150 }; // [100,300] x [100,250]

  it('1. segment fully inside the rect returns the original points unchanged, order preserved', () => {
    const p1: Point = { x: 150, y: 150 };
    const p2: Point = { x: 250, y: 200 };
    const result = clipSegmentToRect(p1, p2, rect);

    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(a).toEqual(p1);
    expect(b).toEqual(p2);
  });

  it('2. segment fully outside the rect (no intersection) returns null', () => {
    const p1: Point = { x: -100, y: -100 };
    const p2: Point = { x: -50, y: -50 };
    expect(clipSegmentToRect(p1, p2, rect)).toBeNull();
  });

  it('2b. segment fully outside but on a line that would hit the rect if extended further is still null when both points share an out-of-range coordinate', () => {
    // Segment entirely to the left of the rect, horizontal - never reaches it.
    const p1: Point = { x: -50, y: 175 };
    const p2: Point = { x: 50, y: 175 };
    expect(clipSegmentToRect(p1, p2, rect)).toBeNull();
  });

  it('3a. segment crossing exactly one rect edge (starts outside, ends inside)', () => {
    const p1: Point = { x: 50, y: 175 }; // outside (left of rect)
    const p2: Point = { x: 200, y: 175 }; // inside
    const result = clipSegmentToRect(p1, p2, rect);

    expect(result).not.toBeNull();
    const [a, b] = result!;
    // One endpoint clamped onto the left boundary x=100, the other is the
    // original in-rect point p2.
    expectPointClose(a, { x: 100, y: 175 });
    expect(b).toEqual(p2);
  });

  it('3b. segment crossing exactly one rect edge (starts inside, ends outside)', () => {
    const p1: Point = { x: 200, y: 175 }; // inside
    const p2: Point = { x: 400, y: 175 }; // outside (right of rect)
    const result = clipSegmentToRect(p1, p2, rect);

    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(a).toEqual(p1);
    expectPointClose(b, { x: 300, y: 175 });
  });

  it('4. a long diagonal segment passing straight through the rect (both endpoints outside) clips to the two boundary crossings', () => {
    // Rect: x in [100,300], y in [100,250].
    // Line from (0,0) to (400,350): parametrize x=400t, y=350t.
    // Entering: earliest boundary crossing among x=100 (t=0.25) and y=100 (t=100/350≈0.2857)
    //   -> tMin = 0.2857142857 (y=100 boundary is hit first since it's larger t... wait need max)
    // Actually entering constraints take the MAX t among left/top crossings.
    const p1: Point = { x: 0, y: 0 };
    const p2: Point = { x: 400, y: 350 };
    const result = clipSegmentToRect(p1, p2, rect);

    expect(result).not.toBeNull();
    const [a, b] = result!;

    // Verify both points lie exactly on the rect boundary (on one of the 4 edges).
    for (const pt of [a, b]) {
      const onVerticalEdge = Math.abs(pt.x - rect.left) < EPS || Math.abs(pt.x - (rect.left + rect.width)) < EPS;
      const onHorizontalEdge = Math.abs(pt.y - rect.top) < EPS || Math.abs(pt.y - (rect.top + rect.height)) < EPS;
      expect(onVerticalEdge || onHorizontalEdge).toBe(true);
      // And within the rect bounds (inclusive, with epsilon slack).
      expect(pt.x).toBeGreaterThanOrEqual(rect.left - EPS);
      expect(pt.x).toBeLessThanOrEqual(rect.left + rect.width + EPS);
      expect(pt.y).toBeGreaterThanOrEqual(rect.top - EPS);
      expect(pt.y).toBeLessThanOrEqual(rect.top + rect.height + EPS);
    }

    // Verify both points still lie exactly on the original line: for
    // dx=400, dy=350, the line satisfies y/x == 350/400 == 7/8.
    for (const pt of [a, b]) {
      expect(Math.abs(pt.y * 400 - pt.x * 350)).toBeLessThanOrEqual(1e-6);
    }

    // The clipped segment should not equal the original endpoints (both
    // original endpoints were outside the rect).
    expect(a).not.toEqual(p1);
    expect(b).not.toEqual(p2);
  });

  it('5a. a rect with zero width never throws and never returns NaN/Infinity coordinates (segment crosses the degenerate rect)', () => {
    const zeroWidthRect: Rect = { left: 150, top: 100, width: 0, height: 150 };
    const p1: Point = { x: 0, y: 175 };
    const p2: Point = { x: 300, y: 175 };

    let result: [Point, Point] | null = null;
    expect(() => {
      result = clipSegmentToRect(p1, p2, zeroWidthRect);
    }).not.toThrow();

    if (result !== null) {
      const [a, b] = result as [Point, Point];
      for (const pt of [a, b]) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
      // Since the horizontal segment passes exactly through x=150 at y=175,
      // which is within [top, top+height], the coincident-line case is a
      // valid intersection collapsed to a single point.
      expectPointClose(a, { x: 150, y: 175 });
      expectPointClose(b, { x: 150, y: 175 });
    }
  });

  it('5b. a rect with zero width returns null for a segment that does not pass through that exact x', () => {
    const zeroWidthRect: Rect = { left: 150, top: 100, width: 0, height: 150 };
    const p1: Point = { x: 0, y: 175 };
    const p2: Point = { x: 100, y: 175 }; // never reaches x=150
    const result = clipSegmentToRect(p1, p2, zeroWidthRect);
    expect(result).toBeNull();
  });

  it('5c. a rect with zero height never throws and never returns NaN/Infinity coordinates', () => {
    const zeroHeightRect: Rect = { left: 100, top: 175, width: 200, height: 0 };
    const p1: Point = { x: 150, y: 0 };
    const p2: Point = { x: 150, y: 400 };

    let result: [Point, Point] | null = null;
    expect(() => {
      result = clipSegmentToRect(p1, p2, zeroHeightRect);
    }).not.toThrow();

    expect(result).not.toBeNull();
    const [a, b] = result!;
    for (const pt of [a, b]) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
    expectPointClose(a, { x: 150, y: 175 });
    expectPointClose(b, { x: 150, y: 175 });
  });

  it('6. a segment that touches the rect only at a single corner (grazing) is treated as an intersection, returning a zero-length segment at that corner', () => {
    // Diagonal line y = x passes exactly through the rect's top-left corner
    // (100, 100) and otherwise stays entirely outside the rect (since for
    // x in (100,300) on this line, y=x too, but this particular segment
    // goes from (0,0) to (100,100), ending exactly at the corner without
    // entering the rect's interior).
    const p1: Point = { x: 0, y: 0 };
    const p2: Point = { x: 100, y: 100 };
    const result = clipSegmentToRect(p1, p2, rect);

    // Documented choice: grazing (touching at exactly one point) DOES count
    // as an intersection. clipSegmentToRect returns that single point twice
    // (a zero-length clipped segment) rather than null.
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expectPointClose(a, { x: 100, y: 100 });
    expectPointClose(b, { x: 100, y: 100 });
  });

  it('6b. a segment that passes near but not through a corner (missing it) returns null', () => {
    // Just barely misses the top-left corner (100,100).
    const p1: Point = { x: 0, y: 0 };
    const p2: Point = { x: 99, y: 100 };
    const result = clipSegmentToRect(p1, p2, rect);
    expect(result).toBeNull();
  });

  it('7a. p1 === p2 (zero-length segment) inside the rect returns that single point twice', () => {
    const p: Point = { x: 200, y: 175 };
    const result = clipSegmentToRect(p, { x: 200, y: 175 }, rect);
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(a).toEqual(p);
    expect(b).toEqual(p);
  });

  it('7b. p1 === p2 (zero-length segment) outside the rect returns null', () => {
    const p: Point = { x: 0, y: 0 };
    const result = clipSegmentToRect(p, { x: 0, y: 0 }, rect);
    expect(result).toBeNull();
  });

  it('7c. p1 === p2 exactly on the rect boundary returns that point twice', () => {
    const p: Point = { x: 100, y: 175 }; // on the left edge
    const result = clipSegmentToRect(p, { x: 100, y: 175 }, rect);
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(a).toEqual(p);
    expect(b).toEqual(p);
  });

  it('numerically verifies exact clip points for a hand-picked horizontal case', () => {
    // rect {left:100,top:100,width:200,height:150}, segment (0,175)->(400,175)
    // should clip to exactly {x:100,y:175} and {x:300,y:175}.
    const p1: Point = { x: 0, y: 175 };
    const p2: Point = { x: 400, y: 175 };
    const result = clipSegmentToRect(p1, p2, rect);

    expect(result).not.toBeNull();
    const [a, b] = result!;
    expectPointClose(a, { x: 100, y: 175 }, 0);
    expectPointClose(b, { x: 300, y: 175 }, 0);
  });

  it('numerically verifies exact clip points for a hand-picked vertical case', () => {
    const p1: Point = { x: 200, y: 0 };
    const p2: Point = { x: 200, y: 500 };
    const result = clipSegmentToRect(p1, p2, rect);

    expect(result).not.toBeNull();
    const [a, b] = result!;
    expectPointClose(a, { x: 200, y: 100 }, 0);
    expectPointClose(b, { x: 200, y: 250 }, 0);
  });

  it('numerically verifies exact clip points for a diagonal case (SUN center -> PRISM center style)', () => {
    // Simulate two window centers with a rect representing a third window
    // the ray happens to pass through, akin to the real usage: a global
    // segment clipped against a popup window's screen rect.
    const sunCenter: Point = { x: 50, y: 50 };
    const prismCenter: Point = { x: 350, y: 350 };
    const midRect: Rect = { left: 150, top: 150, width: 100, height: 100 }; // [150,250]x[150,250]

    const result = clipSegmentToRect(sunCenter, prismCenter, midRect);
    expect(result).not.toBeNull();
    const [a, b] = result!;

    // Line is y = x (dx=dy=300), so it enters/exits the square rect exactly
    // at its corners (150,150) and (250,250).
    expectPointClose(a, { x: 150, y: 150 });
    expectPointClose(b, { x: 250, y: 250 });
  });

  it('does not mutate the input points', () => {
    const p1: Point = { x: 50, y: 175 };
    const p2: Point = { x: 200, y: 175 };
    const p1Copy = { ...p1 };
    const p2Copy = { ...p2 };

    clipSegmentToRect(p1, p2, rect);

    expect(p1).toEqual(p1Copy);
    expect(p2).toEqual(p2Copy);
  });

  it('preserves ordering: p1-side of the clip is closer to original p1 than p2-side (sanity for one-edge crossing)', () => {
    const p1: Point = { x: 50, y: 175 };
    const p2: Point = { x: 200, y: 175 };
    const result = clipSegmentToRect(p1, p2, rect);
    expect(result).not.toBeNull();
    const [a, b] = result!;
    // a should be between p1 and p2 on the x axis, closer to the rect's
    // left edge, and b should equal p2 exactly (since p2 was inside).
    expect(a.x).toBeGreaterThan(p1.x);
    expect(b).toEqual(p2);
  });
});

describe('segmentIntersectsCircle', () => {
  it('true when the segment passes directly through the circle', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10)).toBe(true);
  });

  it('true when the closest approach is within the radius but off-center', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 8 }, 10)).toBe(true);
  });

  it('false when the segment passes outside the radius', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 20 }, 10)).toBe(false);
  });

  it('false when the closest point lies beyond the segment\'s endpoints (line would hit, segment does not)', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 50, y: 0 }, 5)).toBe(false);
  });

  it('true when an endpoint itself is inside the circle', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 2, y: 2 }, 5)).toBe(true);
  });
});
