import { describe, expect, it } from "vitest";
import { findOverlap, snapToEdges } from "./snap";
import type { Clip } from "./timeline";

function clip(id: number, start: number, duration: number): Clip {
  return {
    id,
    sourcePath: "x",
    start,
    duration,
    sourceOffset: 0,
    fadeIn: 0,
    fadeOut: 0,
    gainDb: 0,
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
    compEnabled: false,
    compThresholdDb: -18,
    compRatio: 4,
    compAttackMs: 10,
    compReleaseMs: 80,
    compMakeupDb: 0,
  };
}

describe("snapToEdges", () => {
  const others = [clip(1, 0, 2), clip(2, 5, 1)];
  it("snaps to a clip end when within threshold", () => {
    expect(snapToEdges(2.05, others, 0.1, null)).toBeCloseTo(2);
  });
  it("snaps to a clip start when within threshold", () => {
    expect(snapToEdges(4.95, others, 0.1, null)).toBeCloseTo(5);
  });
  it("returns the unchanged time when nothing is in range", () => {
    expect(snapToEdges(3, others, 0.1, null)).toBe(3);
  });
  it("ignores the clip identified by skipId (don't self-snap)", () => {
    expect(snapToEdges(2.05, others, 0.1, 1)).toBe(2.05);
  });
});

describe("findOverlap", () => {
  it("returns null when the clip doesn't overlap any neighbor", () => {
    const moving = clip(1, 3, 1);
    const others = [clip(2, 0, 2), clip(3, 5, 1)];
    expect(findOverlap(moving, others)).toBeNull();
  });

  it("detects an overlap on the right edge", () => {
    const moving = clip(1, 0, 2);
    const others = [clip(2, 1.5, 1)]; // overlaps in [1.5, 2]
    const r = findOverlap(moving, others);
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(0.5);
    expect(r!.with).toBe(2);
  });

  it("detects an overlap on the left edge", () => {
    const moving = clip(1, 1.5, 1);
    const others = [clip(2, 0, 2)]; // overlaps in [1.5, 2]
    const r = findOverlap(moving, others)!;
    expect(r.amount).toBeCloseTo(0.5);
    expect(r.with).toBe(2);
  });

  it("returns the largest overlap when multiple neighbors clash", () => {
    const moving = clip(1, 0, 4);
    const others = [clip(2, 1, 1), clip(3, 2, 3)]; // 1.0s and 2.0s overlaps
    expect(findOverlap(moving, others)!.with).toBe(3);
  });
});
