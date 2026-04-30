import { Cpu, FolderOpen, Loader2, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findOverlap, snapToEdges } from "../lib/snap";
import { tauri } from "../lib/tauri";
import { clipEnd, type Clip } from "../lib/timeline";
import { useApp } from "../store/appStore";
import { WaveformRenderer } from "./WaveformRenderer";

interface Props {
  onOpenFile: () => void;
}

type ClipDrag =
  | { kind: "move"; id: number; grabOffset: number }
  | { kind: "trim-start"; id: number }
  | { kind: "trim-end"; id: number };

const EDGE_HIT_PX = 6;
const TRACK_HEIGHT_PX = 18;
const SNAP_RATIO = 0.01; // ≈1 % of total duration

export function MainCanvas({ onOpenFile }: Props) {
  const tool = useApp((s) => s.tool);
  const waveform = useApp((s) => s.waveform);
  const models = useApp((s) => s.models);
  const openModelManager = useApp((s) => s.openModelManager);
  const setWaveform = useApp((s) => s.setWaveform);
  const cursor = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);
  const selection = useApp((s) => s.selection);
  const setSelection = useApp((s) => s.setSelection);
  const theme = useApp((s) => s.theme);
  const clips = useApp((s) => s.clips);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const mutateTimeline = useApp((s) => s.mutateTimeline);
  const timeline = useApp((s) => s.timeline);

  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [hoverHandle, setHoverHandle] = useState<"trim" | "move" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const clipDragRef = useRef<ClipDrag | null>(null);

  useEffect(() => {
    const onDrag = async (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      setLoading(true);
      try {
        const path = (f as File & { path?: string }).path ?? f.name;
        const wf = await tauri.extractWaveform(path, 2_000);
        setWaveform(wf);
      } finally {
        setLoading(false);
      }
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener("drop", onDrag);
    window.addEventListener("dragover", onOver);
    return () => {
      window.removeEventListener("drop", onDrag);
      window.removeEventListener("dragover", onOver);
    };
  }, [setWaveform]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        mutateTimeline((t) => (e.shiftKey ? t.redo() : t.undo()));
      } else if ((e.key === "Backspace" || e.key === "Delete") && selection) {
        e.preventDefault();
        mutateTimeline((t) => t.deleteRange(selection.start, selection.end));
        setSelection(null);
      } else if (e.key === "Escape") {
        setSelection(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mutateTimeline, selection, setSelection]);

  function pointerToSecs(clientX: number): number {
    const rect = containerRef.current!.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const dur = waveform!.meta.duration_secs;
    return Math.max(0, Math.min(dur, ratio * dur));
  }

  function secsPerPx(): number {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return waveform!.meta.duration_secs / rect.width;
  }

  function isOnClipLane(clientY: number): boolean {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientY - rect.top >= rect.height - TRACK_HEIGHT_PX;
  }

  /** Find which clip / which handle the pointer is over. */
  function hitTestClip(clientX: number): ClipDrag | null {
    const t = pointerToSecs(clientX);
    const sPerPx = secsPerPx();
    const edgeSecs = EDGE_HIT_PX * sPerPx;
    for (const c of clips) {
      if (t < c.start - edgeSecs || t > clipEnd(c) + edgeSecs) continue;
      if (Math.abs(t - c.start) <= edgeSecs) return { kind: "trim-start", id: c.id };
      if (Math.abs(t - clipEnd(c)) <= edgeSecs) return { kind: "trim-end", id: c.id };
      return { kind: "move", id: c.id, grabOffset: t - c.start };
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!waveform) return;
    const pos = pointerToSecs(e.clientX);

    if (tool === "cut") {
      dragStartRef.current = pos;
      setSelection({ start: pos, end: pos });
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "zoom") {
      setZoom((z) => Math.min(16, z * 1.5));
      return;
    }

    // Select tool: clip handle drag if pointer is in the lane
    if (isOnClipLane(e.clientY)) {
      const hit = hitTestClip(e.clientX);
      if (hit) {
        clipDragRef.current = hit;
        (e.target as Element).setPointerCapture(e.pointerId);
        return;
      }
    }
    setCursor(pos);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!waveform) return;

    if (clipDragRef.current) {
      handleClipDragMove(e.clientX);
      return;
    }
    if (dragStartRef.current !== null) {
      const pos = pointerToSecs(e.clientX);
      const start = Math.min(dragStartRef.current, pos);
      const end = Math.max(dragStartRef.current, pos);
      setSelection({ start, end });
      return;
    }

    if (tool === "select" && isOnClipLane(e.clientY)) {
      const hit = hitTestClip(e.clientX);
      setHoverHandle(hit ? (hit.kind === "move" ? "move" : "trim") : null);
    } else if (hoverHandle) {
      setHoverHandle(null);
    }
  }

  function handleClipDragMove(clientX: number) {
    const drag = clipDragRef.current!;
    const target = pointerToSecs(clientX);
    const dur = waveform!.meta.duration_secs;
    const snapThreshold = dur * SNAP_RATIO;

    if (drag.kind === "trim-start") {
      const snapped = snapToEdges(target, clips, snapThreshold, drag.id);
      mutateTimeline((t) => t.trimStart(drag.id, snapped));
    } else if (drag.kind === "trim-end") {
      const snapped = snapToEdges(target, clips, snapThreshold, drag.id);
      mutateTimeline((t) => t.trimEnd(drag.id, snapped));
    } else {
      const newStart = snapToEdges(
        target - drag.grabOffset,
        clips,
        snapThreshold,
        drag.id
      );
      mutateTimeline((t) => t.moveClip(drag.id, Math.max(0, newStart)));
    }
  }

  function onPointerUp() {
    // Selection drag finalize
    if (dragStartRef.current !== null) {
      dragStartRef.current = null;
      if (selection && Math.abs(selection.end - selection.start) < 1e-3) {
        setSelection(null);
      }
    }
    // Clip drag finalize: detect overlap and apply crossfade
    if (clipDragRef.current) {
      const draggedId = clipDragRef.current.id;
      clipDragRef.current = null;
      const moving = clips.find((c) => c.id === draggedId);
      if (moving) {
        const overlap = findOverlap(moving as Clip, clips);
        if (overlap && overlap.amount > 0.01) {
          mutateTimeline((t) => t.crossfadeAt(overlap.midpoint, overlap.amount));
        }
      }
    }
  }

  function applyCut() {
    if (!selection) return;
    mutateTimeline((t) => t.deleteRange(selection.start, selection.end));
    setSelection(null);
  }

  const accent = theme === "dark" ? "#8B5CF6" : "#6D28D9";

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={32} className="animate-spin accent" />
      </div>
    );
  }

  if (!waveform) {
    const noModels = models.length > 0 && models.every((m) => m.status !== "installed");
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-zinc-500">
        <button
          onClick={onOpenFile}
          className="glass flex items-center gap-2 px-5 py-3 transition hover:text-zinc-100"
        >
          <FolderOpen size={18} />
          <span>Open audio file</span>
        </button>
        <p className="text-sm">또는 파일을 이 영역으로 드래그하세요</p>
        <p className="font-mono text-xs text-zinc-600">
          MP3 · WAV · FLAC · OGG · AAC · M4A
        </p>
        {noModels && (
          <button
            onClick={() => openModelManager(null)}
            className="glass mt-4 flex max-w-md items-center gap-3 px-4 py-3 text-left text-xs hover:text-zinc-100"
          >
            <Cpu size={18} className="accent shrink-0" />
            <span>
              <span className="block text-zinc-300">AI 모델이 아직 설치되지 않았습니다</span>
              <span className="block text-zinc-500">
                노이즈 제거·음원 분리 등 AI 기능을 사용하려면 모델 매니저에서
                다운로드하세요.
              </span>
            </span>
          </button>
        )}
      </div>
    );
  }

  const cursorStyle =
    tool === "cut"
      ? "crosshair"
      : hoverHandle === "trim"
      ? "ew-resize"
      : hoverHandle === "move"
      ? "grab"
      : "pointer";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-8 items-center gap-3 border-b border-white/5 px-4 text-xs text-zinc-500">
        <span>Tool: <span className="accent uppercase">{tool}</span></span>
        <span>Zoom: ×{zoom.toFixed(1)}</span>
        <span>Clips: {clips.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => mutateTimeline((t) => t.undo())}
            disabled={!canUndo}
            className="tool-btn h-7 w-7 disabled:opacity-30"
            title="Undo (⌘Z)"
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={() => mutateTimeline((t) => t.redo())}
            disabled={!canRedo}
            className="tool-btn h-7 w-7 disabled:opacity-30"
            title="Redo (⇧⌘Z)"
          >
            <Redo2 size={13} />
          </button>
          {selection && tool === "cut" && (
            <button
              onClick={applyCut}
              className="btn-primary ml-2 h-7 px-3 text-[11px]"
            >
              Cut
            </button>
          )}
          <span className="ml-3 font-mono">
            {waveform.meta.sample_rate} Hz · {waveform.meta.channels}ch
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: cursorStyle }}
      >
        <WaveformRenderer
          waveform={waveform}
          cursorSecs={cursor}
          selection={selection}
          clips={clips}
          accent={accent}
        />
      </div>

      <div className="h-7 border-t border-white/5 px-4 text-xs leading-7 text-zinc-500">
        {selection
          ? `Selection: ${selection.start.toFixed(2)}s → ${selection.end.toFixed(2)}s (${(selection.end - selection.start).toFixed(2)}s) — Backspace to cut`
          : `${clips.length} clip${clips.length === 1 ? "" : "s"} · ${timeline.duration.toFixed(2)}s · drag clip edges to trim, body to move`}
      </div>
    </div>
  );
}
