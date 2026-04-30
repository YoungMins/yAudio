import { describe, expect, it } from "vitest";
import { estimateBitrate, formatBytes, formatTime } from "./format";

describe("formatTime", () => {
  it("formats whole seconds", () => {
    expect(formatTime(0)).toBe("00:00.00");
    expect(formatTime(65)).toBe("01:05.00");
  });

  it("includes centiseconds", () => {
    expect(formatTime(12.345)).toBe("00:12.34");
  });

  it("guards against negative or non-finite inputs", () => {
    expect(formatTime(-5)).toBe("00:00.00");
    expect(formatTime(NaN)).toBe("00:00.00");
    expect(formatTime(Infinity)).toBe("00:00.00");
  });

  it("pads minutes correctly past an hour", () => {
    // 3725s = 62m 5s
    expect(formatTime(3725)).toBe("62:05.00");
  });
});

describe("formatBytes", () => {
  it("renders em-dash for missing values", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(0)).toBe("—");
  });

  it("uses KB below one megabyte", () => {
    expect(formatBytes(512 * 1024)).toBe("512 KB");
  });

  it("uses MB at one megabyte and above", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("estimateBitrate (browser-preview parity with Rust core)", () => {
  it("falls back to 128 on invalid inputs", () => {
    expect(estimateBitrate(0, 5)).toBe(128);
    expect(estimateBitrate(-1, 5)).toBe(128);
    expect(estimateBitrate(60, 0)).toBe(128);
  });

  it("clamps within [32, 320]", () => {
    expect(estimateBitrate(3600, 0.5)).toBe(32);
    expect(estimateBitrate(10, 1000)).toBe(320);
  });

  it("doubles roughly when target size doubles", () => {
    const a = estimateBitrate(300, 4);
    const b = estimateBitrate(300, 8);
    expect(Math.abs(b - a * 2)).toBeLessThanOrEqual(2);
  });
});
