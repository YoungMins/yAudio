import { create } from "zustand";
import type { AudioMeta, SilenceRange, Tool, WaveformPayload } from "../types/audio";

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

  selection: { start: number; end: number } | null;
  setSelection: (s: { start: number; end: number } | null) => void;

  silences: SilenceRange[];
  setSilences: (r: SilenceRange[]) => void;

  effects: EffectLayer[];
  toggleEffect: (id: string) => void;
  addEffect: (name: string) => void;
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
  setWaveform: (w) => set({ waveform: w, meta: w?.meta ?? null }),

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
}));
