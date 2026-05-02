/**
 * Store-level tests for multi-document state. We exercise the public
 * actions through Zustand directly and rely on `useApp.setState` to
 * reset between cases so each test sees a clean library.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AudioMeta, WaveformPayload } from "../types/audio";
import { useApp } from "./appStore";

function fakeMeta(path: string, dur = 10): AudioMeta {
  return {
    path,
    duration_secs: dur,
    sample_rate: 44_100,
    channels: 2,
    codec: "mock",
    size_bytes: 1_000_000,
  };
}

function fakeWaveform(path: string, dur = 10): WaveformPayload {
  return {
    meta: fakeMeta(path, dur),
    peaks: new Array(20).fill(0),
    bucket_count: 10,
  };
}

beforeEach(() => {
  // Wipe library / active before each test
  useApp.getState().clearLibrary();
});

describe("appStore — addDocument", () => {
  it("adds a doc and auto-activates the first one", () => {
    const id = useApp.getState().addDocument(fakeWaveform("a.wav", 8));
    const s = useApp.getState();
    expect(s.library).toHaveLength(1);
    expect(s.activeId).toBe(id);
    expect(s.meta?.path).toBe("a.wav");
    expect(s.clips).toHaveLength(1); // auto clip covering full duration
    expect(s.clips[0].duration).toBeCloseTo(8);
  });

  it("appending a second doc does not change the active one", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    useApp.getState().addDocument(fakeWaveform("b.wav"));
    expect(useApp.getState().activeId).toBe(a);
    expect(useApp.getState().library).toHaveLength(2);
  });
});

describe("appStore — setActiveDocument", () => {
  it("swaps the mirrored root state to the requested doc", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav", 4));
    const b = useApp.getState().addDocument(fakeWaveform("b.wav", 9));

    useApp.getState().setActiveDocument(b);
    expect(useApp.getState().meta?.path).toBe("b.wav");
    expect(useApp.getState().clips[0].duration).toBeCloseTo(9);

    useApp.getState().setActiveDocument(a);
    expect(useApp.getState().meta?.path).toBe("a.wav");
    expect(useApp.getState().clips[0].duration).toBeCloseTo(4);
  });

  it("preserves per-doc selection across switches", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    const b = useApp.getState().addDocument(fakeWaveform("b.wav"));
    useApp.getState().setSelection({ start: 1, end: 3 }); // applies to a
    useApp.getState().setActiveDocument(b);
    useApp.getState().setSelection({ start: 4, end: 6 });
    useApp.getState().setActiveDocument(a);
    expect(useApp.getState().selection).toEqual({ start: 1, end: 3 });
    useApp.getState().setActiveDocument(b);
    expect(useApp.getState().selection).toEqual({ start: 4, end: 6 });
  });
});

describe("appStore — removeDocument", () => {
  it("removes the doc and clears active when it was the active one", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    useApp.getState().removeDocument(a);
    expect(useApp.getState().library).toHaveLength(0);
    expect(useApp.getState().activeId).toBeNull();
    expect(useApp.getState().meta).toBeNull();
  });

  it("falls back to the next available doc when the active one is removed", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    const b = useApp.getState().addDocument(fakeWaveform("b.wav"));
    useApp.getState().setActiveDocument(b);
    useApp.getState().removeDocument(b);
    expect(useApp.getState().activeId).toBe(a);
  });

  it("removing an inactive doc keeps the active one", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    const b = useApp.getState().addDocument(fakeWaveform("b.wav"));
    useApp.getState().removeDocument(b);
    expect(useApp.getState().activeId).toBe(a);
  });
});

describe("appStore — batch selection", () => {
  it("toggleBatchSelection flips the per-doc flag", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    useApp.getState().toggleBatchSelection(a);
    expect(useApp.getState().library[0].selectedForBatch).toBe(true);
    useApp.getState().toggleBatchSelection(a);
    expect(useApp.getState().library[0].selectedForBatch).toBe(false);
  });

  it("selectAllForBatch / clearBatchSelection touch every entry", () => {
    useApp.getState().addDocument(fakeWaveform("a.wav"));
    useApp.getState().addDocument(fakeWaveform("b.wav"));
    useApp.getState().selectAllForBatch();
    expect(useApp.getState().library.every((d) => d.selectedForBatch)).toBe(true);
    useApp.getState().clearBatchSelection();
    expect(useApp.getState().library.every((d) => !d.selectedForBatch)).toBe(true);
  });

  it("selectedForBatchIds returns the chosen doc ids in library order", () => {
    const a = useApp.getState().addDocument(fakeWaveform("a.wav"));
    useApp.getState().addDocument(fakeWaveform("b.wav"));
    const c = useApp.getState().addDocument(fakeWaveform("c.wav"));
    useApp.getState().toggleBatchSelection(a);
    useApp.getState().toggleBatchSelection(c);
    expect(useApp.getState().selectedForBatchIds()).toEqual([a, c]);
  });
});
