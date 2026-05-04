import { describe, expect, it } from "vitest";
import {
  dbToLinear,
  linearToDb,
  normalizationGainDb,
  peakOfWaveform,
} from "./audioMath";

describe("dbToLinear / linearToDb", () => {
  it("0 dB ↔ 1.0 linear", () => {
    expect(dbToLinear(0)).toBeCloseTo(1);
    expect(linearToDb(1)).toBeCloseTo(0);
  });

  it("-6 dB ≈ 0.5 linear (within 1%)", () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 2);
  });

  it("+6 dB ≈ 2.0 linear (within 1%)", () => {
    expect(dbToLinear(6)).toBeCloseTo(1.995, 2);
  });

  it("linearToDb maps silence to -Infinity", () => {
    expect(linearToDb(0)).toBe(-Infinity);
    expect(linearToDb(-0.5)).toBe(-Infinity);
  });
});

describe("peakOfWaveform", () => {
  it("returns the largest absolute sample", () => {
    expect(peakOfWaveform([-0.7, 0.3, -0.1, 0.4])).toBeCloseTo(0.7);
  });
  it("returns 0 for an empty buffer", () => {
    expect(peakOfWaveform([])).toBe(0);
  });
});

describe("normalizationGainDb", () => {
  it("brings a 0.5 peak up to ~0 dBFS by adding ~6 dB", () => {
    const db = normalizationGainDb(0.5, 0);
    expect(db).toBeCloseTo(6.02, 1);
  });

  it("at the default -1 dBFS target, a 1.0 peak yields ~-1 dB", () => {
    const db = normalizationGainDb(1, -1);
    expect(db).toBeCloseTo(-1, 2);
  });

  it("returns 0 for silent audio so we never compute -Infinity", () => {
    expect(normalizationGainDb(0, 0)).toBe(0);
    expect(normalizationGainDb(-0.1, 0)).toBe(0);
  });
});
