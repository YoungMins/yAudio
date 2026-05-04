import { describe, expect, it } from "vitest";
import { computeGainAtTime } from "./fade";

describe("computeGainAtTime", () => {
  it("returns 1 in the middle of a track with no fades", () => {
    expect(computeGainAtTime(5, 10, 0, 0)).toBe(1);
  });

  it("ramps linearly from 0 to 1 across the fade-in region", () => {
    expect(computeGainAtTime(0, 10, 2, 0)).toBe(0);
    expect(computeGainAtTime(1, 10, 2, 0)).toBeCloseTo(0.5);
    expect(computeGainAtTime(2, 10, 2, 0)).toBe(1);
    // beyond fade-in but well inside the track stays at 1
    expect(computeGainAtTime(5, 10, 2, 0)).toBe(1);
  });

  it("ramps linearly from 1 to 0 across the fade-out region", () => {
    expect(computeGainAtTime(8, 10, 0, 2)).toBe(1);
    expect(computeGainAtTime(9, 10, 0, 2)).toBeCloseTo(0.5);
    expect(computeGainAtTime(10, 10, 0, 2)).toBe(0);
  });

  it("clamps to silence before start and after end", () => {
    expect(computeGainAtTime(-1, 10, 0, 0)).toBe(0);
    expect(computeGainAtTime(11, 10, 0, 0)).toBe(0);
  });

  it("takes the smaller of fade-in / fade-out when the regions overlap", () => {
    // dur = 4, fadeIn = fadeOut = 3 → fade ranges overlap; at the
    // midpoint (t=2) both ramps say 2/3 ≈ 0.667
    expect(computeGainAtTime(2, 4, 3, 3)).toBeCloseTo(2 / 3, 5);
    // exactly at end the fade-out wins
    expect(computeGainAtTime(4, 4, 3, 3)).toBe(0);
  });

  it("returns 0 when the total duration is 0 or negative", () => {
    expect(computeGainAtTime(0, 0, 0, 0)).toBe(0);
    expect(computeGainAtTime(0, -1, 1, 1)).toBe(0);
  });

  it("ignores a zero fade duration (no ramp)", () => {
    expect(computeGainAtTime(0, 10, 0, 0)).toBe(1);
    expect(computeGainAtTime(10, 10, 0, 0)).toBe(1);
  });
});
