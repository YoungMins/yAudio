import { describe, expect, it } from "vitest";
import { Timeline } from "./timeline";

function tlWith(spans: [number, number][]): Timeline {
  const t = new Timeline();
  for (const [start, duration] of spans) {
    t.add({ sourcePath: "a.wav", start, duration, sourceOffset: 0 });
  }
  return t;
}

describe("Timeline — construction", () => {
  it("is empty by default", () => {
    const t = new Timeline();
    expect(t.clips).toEqual([]);
    expect(t.duration).toBe(0);
  });

  it("assigns ascending unique ids", () => {
    const t = new Timeline();
    const a = t.add({ sourcePath: "a", start: 0, duration: 1, sourceOffset: 0 });
    const b = t.add({ sourcePath: "a", start: 1, duration: 1, sourceOffset: 0 });
    expect(a).not.toBe(b);
    expect(t.clips.length).toBe(2);
  });

  it("keeps clips sorted by start time", () => {
    const t = tlWith([
      [5, 1],
      [1, 1],
      [3, 1],
    ]);
    expect(t.clips.map((c) => c.start)).toEqual([1, 3, 5]);
  });
});

describe("Timeline — delete_range", () => {
  it("drops a fully contained clip and shifts later clips", () => {
    const t = tlWith([
      [0, 2],
      [3, 1],
      [5, 2],
    ]);
    t.deleteRange(2.5, 4.5);
    expect(t.clips.length).toBe(2);
    expect(t.clips[0].start).toBe(0);
    expect(t.clips[1].start).toBe(3);
    expect(t.clips[1].duration).toBe(2);
  });

  it("splits a clip that strictly contains the range", () => {
    const t = tlWith([[0, 5]]);
    t.deleteRange(3, 4);
    const total = t.clips.reduce((acc, c) => acc + c.duration, 0);
    expect(total).toBeCloseTo(4, 9);
    expect(t.clips[0].start).toBe(0);
    expect(t.clips[t.clips.length - 1].start + t.clips[t.clips.length - 1].duration).toBeLessThanOrEqual(4 + 1e-9);
  });

  it("is a no-op when end <= start", () => {
    const t = tlWith([[0, 2]]);
    const before = JSON.stringify(t.clips);
    t.deleteRange(3, 1);
    expect(JSON.stringify(t.clips)).toBe(before);
  });
});

describe("Timeline — cut and paste", () => {
  it("cut returns a zero-based slice and removes from timeline", () => {
    const t = tlWith([[0, 4]]);
    const captured = t.cutRange(1, 3);
    expect(captured).toHaveLength(1);
    expect(captured[0].start).toBe(0);
    expect(captured[0].duration).toBeCloseTo(2, 9);
    const total = t.clips.reduce((a, c) => a + c.duration, 0);
    expect(total).toBeCloseTo(2, 9);
  });

  it("paste inserts at the requested offset", () => {
    const t = tlWith([[0, 2]]);
    const clipboard = [
      { id: 0, sourcePath: "x", start: 0, duration: 1, sourceOffset: 0, fadeIn: 0, fadeOut: 0, gainDb: 0 },
      { id: 0, sourcePath: "x", start: 1, duration: 1, sourceOffset: 0, fadeIn: 0, fadeOut: 0, gainDb: 0 },
    ];
    t.paste(5, clipboard);
    expect(t.clips.map((c) => c.start)).toEqual([0, 5, 6]);
  });
});

describe("Timeline — undo / redo", () => {
  it("undo restores prior state, redo replays it", () => {
    const t = new Timeline();
    t.add({ sourcePath: "a", start: 0, duration: 1, sourceOffset: 0 });
    t.add({ sourcePath: "a", start: 2, duration: 1, sourceOffset: 0 });
    t.deleteRange(0, 1);
    expect(t.clips.length).toBe(1);

    expect(t.undo()).toBe(true);
    expect(t.clips.length).toBe(2);
    expect(t.redo()).toBe(true);
    expect(t.clips.length).toBe(1);
  });

  it("undo on an empty history returns false without throwing", () => {
    const t = new Timeline();
    expect(t.undo()).toBe(false);
    expect(t.redo()).toBe(false);
  });

  it("a new mutation after undo clears the redo stack", () => {
    const t = new Timeline();
    t.add({ sourcePath: "a", start: 0, duration: 1, sourceOffset: 0 });
    t.add({ sourcePath: "a", start: 1, duration: 1, sourceOffset: 0 });
    t.undo();
    t.add({ sourcePath: "a", start: 5, duration: 1, sourceOffset: 0 });
    expect(t.redo()).toBe(false);
  });

  it("canUndo / canRedo reflect the stacks", () => {
    const t = new Timeline();
    expect(t.canUndo).toBe(false);
    expect(t.canRedo).toBe(false);
    t.add({ sourcePath: "a", start: 0, duration: 1, sourceOffset: 0 });
    expect(t.canUndo).toBe(true);
    expect(t.canRedo).toBe(false);
    t.undo();
    expect(t.canUndo).toBe(false);
    expect(t.canRedo).toBe(true);
  });
});

describe("Timeline — clip ops (trim/move/fade)", () => {
  it("trimStart advances source offset and shrinks duration", () => {
    const t = new Timeline();
    const id = t.add({ sourcePath: "a", start: 0, duration: 4, sourceOffset: 0 });
    expect(t.trimStart(id, 1)).toBe(true);
    const c = t.find(id)!;
    expect(c.start).toBeCloseTo(1);
    expect(c.duration).toBeCloseTo(3);
    expect(c.sourceOffset).toBeCloseTo(1);
  });

  it("trimStart clamps so sourceOffset never goes negative", () => {
    const t = new Timeline();
    const id = t.add({ sourcePath: "a", start: 5, duration: 2, sourceOffset: 1 });
    t.trimStart(id, 0); // would need delta=-5 but only -1 is available
    const c = t.find(id)!;
    expect(c.sourceOffset).toBeCloseTo(0);
    expect(c.start).toBeCloseTo(4);
    expect(c.duration).toBeCloseTo(3);
  });

  it("trimEnd only changes duration", () => {
    const t = new Timeline();
    const id = t.add({ sourcePath: "a", start: 1, duration: 4, sourceOffset: 0.5 });
    expect(t.trimEnd(id, 3)).toBe(true);
    const c = t.find(id)!;
    expect(c.start).toBeCloseTo(1);
    expect(c.duration).toBeCloseTo(2);
    expect(c.sourceOffset).toBeCloseTo(0.5);
  });

  it("moveClip changes start without touching sourceOffset", () => {
    const t = new Timeline();
    const id = t.add({ sourcePath: "a", start: 1, duration: 2, sourceOffset: 0.7 });
    expect(t.moveClip(id, 5)).toBe(true);
    expect(t.find(id)!.start).toBeCloseTo(5);
    expect(t.find(id)!.sourceOffset).toBeCloseTo(0.7);
  });

  it("setFadeIn / setFadeOut clamp to clip duration", () => {
    const t = new Timeline();
    const id = t.add({ sourcePath: "a", start: 0, duration: 2, sourceOffset: 0 });
    t.setFadeIn(id, 5);
    expect(t.find(id)!.fadeIn).toBeCloseTo(2);
  });

  it("ops targeting an unknown id return false", () => {
    const t = new Timeline();
    expect(t.trimStart(42, 1)).toBe(false);
    expect(t.trimEnd(42, 1)).toBe(false);
    expect(t.moveClip(42, 1)).toBe(false);
    expect(t.setFadeIn(42, 1)).toBe(false);
    expect(t.setFadeOut(42, 1)).toBe(false);
  });

  it("trim and move operations are individually undoable", () => {
    const t = new Timeline();
    const id = t.add({ sourcePath: "a", start: 0, duration: 4, sourceOffset: 0 });
    t.trimStart(id, 1);
    t.trimEnd(id, 3);
    expect(t.find(id)!.duration).toBeCloseTo(2);
    t.undo();
    expect(t.find(id)!.duration).toBeCloseTo(3);
    t.undo();
    expect(t.find(id)!.duration).toBeCloseTo(4);
  });
});

describe("Timeline — crossfade", () => {
  it("marks fade_out on the left and fade_in on the right", () => {
    const t = tlWith([
      [0, 2],
      [2, 2],
    ]);
    t.crossfadeAt(2, 0.5);
    expect(t.clips[0].fadeOut).toBeCloseTo(0.5);
    expect(t.clips[1].fadeIn).toBeCloseTo(0.5);
  });
});
