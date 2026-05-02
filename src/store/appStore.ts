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

/**
 * One loaded audio file. Each entry owns its own Timeline so undo
 * history is preserved across switches; the persistent UI state
 * (selection / cursor / silences / batch checkbox) lives here too.
 */
export interface DocEntry {
  id: string;
  meta: AudioMeta;
  waveform: WaveformPayload;
  timeline: Timeline;
  selection: { start: number; end: number } | null;
  silences: SilenceRange[];
  cursorSecs: number;
  selectedForBatch: boolean;
  effects: EffectLayer[];
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

  // ── Multi-document library ──────────────────────────────────────
  library: DocEntry[];
  activeId: string | null;
  addDocument: (waveform: WaveformPayload) => string;
  setActiveDocument: (id: string) => void;
  removeDocument: (id: string) => void;
  toggleBatchSelection: (id: string) => void;
  selectAllForBatch: () => void;
  clearBatchSelection: () => void;
  selectedForBatchIds: () => string[];
  clearLibrary: () => void;

  // ── Mirrors of the active doc's state for backward compatibility ─
  meta: AudioMeta | null;
  waveform: WaveformPayload | null;
  setWaveform: (w: WaveformPayload | null) => void; // legacy: forwards to addDocument

  timeline: Timeline;
  timelineRev: number;
  clips: readonly Clip[];
  canUndo: boolean;
  canRedo: boolean;
  clipboard: Clip[];
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

const EMPTY_TIMELINE = new Timeline();
let nextDocId = 1;
const newId = () => `doc-${nextDocId++}`;

/**
 * Project the active library entry into the root mirror fields. We use a
 * dedicated function rather than scattering `set` calls so every action
 * that touches the active doc updates the mirrors consistently.
 */
function mirrorOfActive(library: DocEntry[], activeId: string | null) {
  const active = activeId ? library.find((d) => d.id === activeId) : null;
  if (!active) {
    return {
      meta: null,
      waveform: null,
      timeline: EMPTY_TIMELINE,
      clips: [] as readonly Clip[],
      canUndo: false,
      canRedo: false,
      timelineRev: 0,
      cursorSecs: 0,
      selection: null,
      silences: [] as SilenceRange[],
      effects: [] as EffectLayer[],
    };
  }
  return {
    meta: active.meta,
    waveform: active.waveform,
    timeline: active.timeline,
    clips: [...active.timeline.clips] as readonly Clip[],
    canUndo: active.timeline.canUndo,
    canRedo: active.timeline.canRedo,
    timelineRev: Date.now(), // monotonically increases on every mirror refresh
    cursorSecs: active.cursorSecs,
    selection: active.selection,
    silences: active.silences,
    effects: active.effects,
  };
}

function makeDoc(waveform: WaveformPayload): DocEntry {
  const timeline = new Timeline();
  timeline.add({
    sourcePath: waveform.meta.path,
    start: 0,
    duration: waveform.meta.duration_secs,
    sourceOffset: 0,
  });
  return {
    id: newId(),
    meta: waveform.meta,
    waveform,
    timeline,
    selection: null,
    silences: [],
    cursorSecs: 0,
    selectedForBatch: false,
    effects: [
      { id: "noise", name: "AI Noise Clean", enabled: false },
      { id: "split", name: "Stem Split", enabled: false },
    ],
  };
}

export const useApp = create<AppState>((set, get) => ({
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

  // ── Multi-document library ──────────────────────────────────────
  library: [],
  activeId: null,

  addDocument: (waveform) => {
    const doc = makeDoc(waveform);
    set((s) => {
      const library = [...s.library, doc];
      const activeId = s.activeId ?? doc.id;
      return { library, activeId, ...mirrorOfActive(library, activeId) };
    });
    return doc.id;
  },

  setActiveDocument: (id) =>
    set((s) => {
      if (!s.library.some((d) => d.id === id)) return {};
      return { activeId: id, ...mirrorOfActive(s.library, id) };
    }),

  removeDocument: (id) =>
    set((s) => {
      const idx = s.library.findIndex((d) => d.id === id);
      if (idx < 0) return {};
      const library = s.library.filter((d) => d.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        activeId = library[idx]?.id ?? library[idx - 1]?.id ?? library[0]?.id ?? null;
      }
      return { library, activeId, ...mirrorOfActive(library, activeId) };
    }),

  toggleBatchSelection: (id) =>
    set((s) => ({
      library: s.library.map((d) =>
        d.id === id ? { ...d, selectedForBatch: !d.selectedForBatch } : d
      ),
    })),

  selectAllForBatch: () =>
    set((s) => ({
      library: s.library.map((d) => ({ ...d, selectedForBatch: true })),
    })),

  clearBatchSelection: () =>
    set((s) => ({
      library: s.library.map((d) => ({ ...d, selectedForBatch: false })),
    })),

  selectedForBatchIds: () =>
    get().library.filter((d) => d.selectedForBatch).map((d) => d.id),

  clearLibrary: () =>
    set(() => ({
      library: [],
      activeId: null,
      ...mirrorOfActive([], null),
    })),

  // ── Mirrored fields & legacy entry points ───────────────────────
  meta: null,
  waveform: null,
  /** Legacy: callers that handed us a single waveform now create a doc. */
  setWaveform: (w) => {
    if (!w) {
      get().clearLibrary();
      return;
    }
    get().addDocument(w);
  },

  timeline: EMPTY_TIMELINE,
  timelineRev: 0,
  clips: [],
  canUndo: false,
  canRedo: false,
  clipboard: [],
  cursorSecs: 0,
  selection: null,
  silences: [],
  effects: [],

  setCursor: (cursor) =>
    set((s) => {
      if (!s.activeId) return { cursorSecs: cursor };
      return {
        library: s.library.map((d) =>
          d.id === s.activeId ? { ...d, cursorSecs: cursor } : d
        ),
        cursorSecs: cursor,
      };
    }),

  setSelection: (sel) =>
    set((s) => {
      if (!s.activeId) return { selection: sel };
      return {
        library: s.library.map((d) =>
          d.id === s.activeId ? { ...d, selection: sel } : d
        ),
        selection: sel,
      };
    }),

  setSilences: (r) =>
    set((s) => {
      if (!s.activeId) return { silences: r };
      return {
        library: s.library.map((d) =>
          d.id === s.activeId ? { ...d, silences: r } : d
        ),
        silences: r,
      };
    }),

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

  toggleEffect: (id) =>
    set((s) => {
      const effects = s.effects.map((e) =>
        e.id === id ? { ...e, enabled: !e.enabled } : e
      );
      if (!s.activeId) return { effects };
      return {
        effects,
        library: s.library.map((d) =>
          d.id === s.activeId ? { ...d, effects } : d
        ),
      };
    }),

  addEffect: (name) =>
    set((s) => {
      const effects = [
        ...s.effects,
        { id: `${Date.now()}`, name, enabled: true },
      ];
      if (!s.activeId) return { effects };
      return {
        effects,
        library: s.library.map((d) =>
          d.id === s.activeId ? { ...d, effects } : d
        ),
      };
    }),

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
