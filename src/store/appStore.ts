import { create } from "zustand";
import { Timeline, type Clip } from "../lib/timeline";
import type {
  AudioMeta,
  DownloadProgress,
  ModelInfo,
  SilenceRange,
  Tool,
  WaveformPayload,
} from "../types/audio";

export type Theme = "dark" | "light";

export interface EffectLayer {
  id: string;
  name: string;
  enabled: boolean;
}

interface AppState {
  theme: Theme;
  toggleTheme: () => void;

  tool: Tool;
  setTool: (t: Tool) => void;

  isPlaying: boolean;
  setPlaying: (v: boolean) => void;
  cursorSecs: number;
  setCursor: (s: number) => void;

  meta: AudioMeta | null;
  waveform: WaveformPayload | null;
  setWaveform: (w: WaveformPayload | null) => void;

  timeline: Timeline;
  /** Bumps every time the timeline mutates so React re-renders. */
  timelineRev: number;
  clips: readonly Clip[];
  canUndo: boolean;
  canRedo: boolean;
  clipboard: Clip[];
  /** Run a Timeline mutation and refresh derived state in one go. */
  mutateTimeline: (f: (t: Timeline) => void) => void;
  resetTimeline: () => void;

  selection: { start: number; end: number } | null;
  setSelection: (s: { start: number; end: number } | null) => void;

  silences: SilenceRange[];
  setSilences: (r: SilenceRange[]) => void;

  effects: EffectLayer[];
  toggleEffect: (id: string) => void;
  addEffect: (name: string) => void;

  models: ModelInfo[];
  setModels: (m: ModelInfo[]) => void;
  modelProgress: Record<string, DownloadProgress>;
  setModelProgress: (p: DownloadProgress) => void;
  modelManagerOpen: boolean;
  openModelManager: (highlight?: string | null) => void;
  closeModelManager: () => void;
  highlightedModel: string | null;
}

export const useApp = create<AppState>((set) => ({
  theme: "dark",
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === "dark" ? "light" : "dark";
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      root.classList.add(next);
      return { theme: next };
    }),

  tool: "select",
  setTool: (t) => set({ tool: t }),

  isPlaying: false,
  setPlaying: (v) => set({ isPlaying: v }),
  cursorSecs: 0,
  setCursor: (s) => set({ cursorSecs: s }),

  meta: null,
  waveform: null,
  setWaveform: (w) =>
    set((s) => {
      // Loading a new file resets the timeline to a single clip covering it.
      const meta = w?.meta ?? null;
      s.timeline.reset();
      if (meta) {
        s.timeline.add({
          sourcePath: meta.path,
          start: 0,
          duration: meta.duration_secs,
          sourceOffset: 0,
        });
      }
      return {
        waveform: w,
        meta,
        timelineRev: s.timelineRev + 1,
        clips: [...s.timeline.clips],
        canUndo: s.timeline.canUndo,
        canRedo: s.timeline.canRedo,
        selection: null,
        cursorSecs: 0,
      };
    }),

  timeline: new Timeline(),
  timelineRev: 0,
  clips: [],
  canUndo: false,
  canRedo: false,
  clipboard: [],
  mutateTimeline: (f) =>
    set((s) => {
      f(s.timeline);
      return {
        timelineRev: s.timelineRev + 1,
        clips: [...s.timeline.clips],
        canUndo: s.timeline.canUndo,
        canRedo: s.timeline.canRedo,
      };
    }),
  resetTimeline: () =>
    set((s) => {
      s.timeline.reset();
      return {
        timelineRev: s.timelineRev + 1,
        clips: [],
        canUndo: false,
        canRedo: false,
      };
    }),

  selection: null,
  setSelection: (s) => set({ selection: s }),

  silences: [],
  setSilences: (r) => set({ silences: r }),

  effects: [
    { id: "noise", name: "AI Noise Clean", enabled: false },
    { id: "split", name: "Stem Split", enabled: false },
  ],
  toggleEffect: (id) =>
    set((s) => ({
      effects: s.effects.map((e) =>
        e.id === id ? { ...e, enabled: !e.enabled } : e
      ),
    })),
  addEffect: (name) =>
    set((s) => ({
      effects: [
        ...s.effects,
        { id: `${Date.now()}`, name, enabled: true },
      ],
    })),

  models: [],
  setModels: (m) => set({ models: m }),
  modelProgress: {},
  setModelProgress: (p) =>
    set((s) => ({ modelProgress: { ...s.modelProgress, [p.id]: p } })),
  modelManagerOpen: false,
  highlightedModel: null,
  openModelManager: (highlight = null) =>
    set({ modelManagerOpen: true, highlightedModel: highlight }),
  closeModelManager: () =>
    set({ modelManagerOpen: false, highlightedModel: null }),
}));
