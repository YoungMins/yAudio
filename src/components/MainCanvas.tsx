import { Cpu, FolderOpen, Loader2, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
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
const SNAP_RATIO = 0.01; // 1% of visible window
const MIN_VIEW_SECS = 0.05;

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

  const totalDur = waveform?.meta.duration_secs ?? 0;
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [hoverHandle, setHoverHandle] = useState<"trim" | "move" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const clipDragRef = useRef<ClipDrag | null>(null);

  const viewSpan = totalDur > 0 ? totalDur / zoom : 1;
  const clampedViewStart = Math.max(0, Math.min(viewStart, Math.max(0, totalDur - viewSpan)));

  // Reset view when a new file loads.
  useEffect(() => {
    setZoom(1);
    setViewStart(0);
  }, [waveform?.meta.path]);

  // Auto-pan: keep playback cursor in view.
  useEffect(() => {
    if (!waveform || !totalDur) return;
    if (cursor < clampedViewStart || cursor > clampedViewStart + viewSpan) {
      setViewStart(Math.max(0, Math.min(totalDur - viewSpan, cursor - viewSpan / 2)));
    }
  }, [cursor, clampedViewStart, viewSpan, totalDur, waveform]);

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
    const t = clampedViewStart + ratio * viewSpan;
    return Math.max(0, Math.min(totalDur, t));
  }

  function secsPerPx(): number {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return viewSpan / rect.width;
  }

  function isOnClipLane(clientY: number): boolean {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientY - rect.top >= rect.height - TRACK_HEIGHT_PX;
  }

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
      const factor = e.altKey ? 1 / 1.5 : 1.5;
      const newZoom = Math.max(1, Math.min(64, zoom * factor));
      setViewStart(pos - (pos - clampedViewStart) * (zoom / newZoom));
      setZoom(newZoom);
      return;
    }

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
    const snapThreshold = viewSpan * SNAP_RATIO;

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
    if (dragStartRef.current !== null) {
      dragStartRef.current = null;
      if (selection && Math.abs(selection.end - selection.start) < 1e-3) {
        setSelection(null);
      }
    }
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

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!waveform) return;
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      const newZoom = Math.max(1, Math.min(64, zoom * factor));
      const anchor = pointerToSecs(e.clientX);
      const newSpan = totalDur / newZoom;
      setViewStart(
        Math.max(0, Math.min(totalDur - newSpan, anchor - newSpan / 2))
      );
      setZoom(newZoom);
    } else {
      const dx = e.deltaY * (viewSpan / 600);
      setViewStart((v) => Math.max(0, Math.min(totalDur - viewSpan, v + dx)));
    }
  }

  function applyCut() {
    if (!selection) return;
    mutateTimeline((t) => t.deleteRange(selection.start, selection.end));
    setSelection(null);
  }

  function zoomBy(factor: number) {
    const center = clampedViewStart + viewSpan / 2;
    const newZoom = Math.max(1, Math.min(64, zoom * factor));
    const newSpan = totalDur / newZoom;
    setViewStart(Math.max(0, Math.min(totalDur - newSpan, center - newSpan / 2)));
    setZoom(newZoom);
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
      : tool === "zoom"
      ? "zoom-in"
      : hoverHandle === "trim"
      ? "ew-resize"
      : hoverHandle === "move"
      ? "grab"
      : "pointer";

  // Range slider models the visible window's left edge in seconds. We
  // disable it when fully zoomed out (whole file already visible).
  const sliderMax = Math.max(0, totalDur - viewSpan);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-8 items-center gap-3 border-b border-white/5 px-4 text-xs text-zinc-500">
        <span>Tool: <span className="accent uppercase">{tool}</span></span>
        <span>Clips: {clips.length}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomBy(1 / 1.5)}
            disabled={zoom <= 1}
            className="tool-btn h-7 w-7 disabled:opacity-30"
            title="Zoom out"
          >
            <ZoomOut size={13} />
          </button>
          <span className="font-mono">×{zoom.toFixed(1)}</span>
          <button
            onClick={() => zoomBy(1.5)}
            disabled={zoom >= 64}
            className="tool-btn h-7 w-7 disabled:opacity-30"
            title="Zoom in"
          >
            <ZoomIn size={13} />
          </button>
        </div>
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
          {selection && (
            <button
              onClick={applyCut}
              className="btn-primary ml-2 h-7 px-3 text-[11px]"
              title="Cut selection (Backspace)"
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
        onWheel={onWheel}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: cursorStyle }}
      >
        <WaveformRenderer
          waveform={waveform}
          cursorSecs={cursor}
          selection={selection}
          clips={clips}
          accent={accent}
          viewStart={clampedViewStart}
          viewSpan={Math.max(MIN_VIEW_SECS, viewSpan)}
        />
      </div>

      {/* Horizontal pan slider — only meaningful when zoomed in */}
      <div className="flex h-7 items-center gap-3 border-t border-white/5 px-4">
        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
          {clampedViewStart.toFixed(1)}s
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0.0001, sliderMax)}
          step={Math.max(0.001, viewSpan / 1000)}
          value={Math.min(clampedViewStart, sliderMax)}
          onChange={(e) => setViewStart(Number(e.target.value))}
          disabled={sliderMax <= 0}
          className="flex-1 accent-[var(--accent)] disabled:opacity-30"
        />
        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
          {(clampedViewStart + viewSpan).toFixed(1)}s / {totalDur.toFixed(1)}s
        </span>
      </div>

      <div className="h-7 border-t border-white/5 px-4 text-xs leading-7 text-zinc-500">
        {selection
          ? `Selection: ${selection.start.toFixed(2)}s → ${selection.end.toFixed(2)}s (${(selection.end - selection.start).toFixed(2)}s) — Backspace to cut, Esc to clear`
          : `${clips.length} clip${clips.length === 1 ? "" : "s"} · ${timeline.duration.toFixed(2)}s · drag clip edges to trim, body to move · Cut tool (C) drag to select · ⌘/Ctrl+wheel to zoom`}
      </div>
    </div>
  );
}
