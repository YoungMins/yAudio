import { FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tauri } from "../lib/tauri";
import { useApp } from "../store/appStore";
import { WaveformRenderer } from "./WaveformRenderer";

interface Props {
  onOpenFile: () => void;
}

export function MainCanvas({ onOpenFile }: Props) {
  const tool = useApp((s) => s.tool);
  const waveform = useApp((s) => s.waveform);
  const setWaveform = useApp((s) => s.setWaveform);
  const cursor = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);
  const selection = useApp((s) => s.selection);
  const setSelection = useApp((s) => s.setSelection);
  const theme = useApp((s) => s.theme);

  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDrag = async (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      setLoading(true);
      try {
        // In Tauri 2.x file drops expose absolute paths via the listen API;
        // in browser preview we fall back to the File name (mock data).
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

  function handlePointer(e: React.PointerEvent<HTMLDivElement>) {
    if (!waveform || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const dur = waveform.meta.duration_secs;
    const pos = ratio * dur;

    if (tool === "cut") {
      const start = selection?.start ?? pos;
      setSelection({
        start: Math.min(start, pos),
        end: Math.max(start, pos),
      });
    } else if (tool === "zoom") {
      setZoom((z) => Math.min(16, z * 1.5));
    } else {
      setCursor(Math.max(0, Math.min(dur, pos)));
    }
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
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-8 items-center gap-3 border-b border-white/5 px-4 text-xs text-zinc-500">
        <span>Tool: <span className="accent uppercase">{tool}</span></span>
        <span>Zoom: ×{zoom.toFixed(1)}</span>
        <span className="ml-auto font-mono">
          {waveform.meta.sample_rate} Hz · {waveform.meta.channels}ch
        </span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointer}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: tool === "cut" ? "crosshair" : "pointer" }}
      >
        <WaveformRenderer
          waveform={waveform}
          cursorSecs={cursor}
          selection={selection}
          accent={accent}
        />
      </div>

      <div className="h-7 border-t border-white/5 px-4 text-xs leading-7 text-zinc-500">
        {selection
          ? `Selection: ${selection.start.toFixed(2)}s → ${selection.end.toFixed(2)}s (${(selection.end - selection.start).toFixed(2)}s)`
          : "No selection"}
      </div>
    </div>
  );
}
