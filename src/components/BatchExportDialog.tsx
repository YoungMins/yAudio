import { Loader2, Package, X } from "lucide-react";
import { useState } from "react";
import { tauri } from "../lib/tauri";
import { toExportClip } from "../lib/timeline";
import { useApp } from "../store/appStore";
import type { AudioFormat } from "../types/audio";

const FORMATS: AudioFormat[] = ["mp3", "wav", "flac", "ogg", "aac", "m4a"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Reports progress so the parent can render a global indicator. */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Compress / convert every batch-selected document with one shared
 * target size. Output paths default to "{original}.export.{format}"
 * next to each input.
 */
export function BatchExportDialog({ open, onClose, onProgress }: Props) {
  const library = useApp((s) => s.library);
  const [format, setFormat] = useState<AudioFormat>("mp3");
  const [targetMb, setTargetMb] = useState(3);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    { path: string; ok: boolean; message: string }[]
  >([]);

  const selected = library.filter((d) => d.selectedForBatch);

  if (!open) return null;

  async function run() {
    setBusy(true);
    setResults([]);
    onProgress?.(0, selected.length);
    const out: { path: string; ok: boolean; message: string }[] = [];
    for (let i = 0; i < selected.length; i++) {
      const doc = selected[i];
      const base = doc.meta.path.replace(/\.[^/.]+$/, "");
      const outPath = `${base}.export.${format}`;
      try {
        const clips = [...doc.timeline.clips].map(toExportClip);
        const kbps = await tauri.estimateTargetBitrate(
          doc.meta.duration_secs,
          targetMb
        );
        await tauri.exportTimeline(
          clips,
          outPath,
          format === "wav" ? undefined : format,
          format === "wav" ? undefined : kbps
        );
        out.push({ path: outPath, ok: true, message: "✓ exported" });
      } catch (e) {
        out.push({
          path: outPath,
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      setResults([...out]);
      onProgress?.(i + 1, selected.length);
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="glass flex max-h-[80vh] w-[520px] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2">
            <Package size={18} className="accent" />
            <h2 className="text-base font-semibold">Batch Export</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="tool-btn h-8 w-8 disabled:opacity-30"
          >
            <X size={14} />
          </button>
        </header>

        <div className="space-y-4 p-5 text-xs">
          <p className="text-zinc-400">
            {selected.length} file{selected.length === 1 ? "" : "s"} selected.
            Each is rendered through its own timeline (cuts, fades, gain) and
            re-encoded with the chosen target size.
          </p>

          <label className="block">
            <span className="text-zinc-400">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as AudioFormat)}
              disabled={busy}
              className="input mt-1 text-xs"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          {format !== "wav" && (
            <div>
              <label className="flex items-center justify-between">
                <span className="text-zinc-400">Target size (per file)</span>
                <span className="font-mono accent">{targetMb.toFixed(1)} MB</span>
              </label>
              <input
                type="range"
                min={0.5}
                max={50}
                step={0.5}
                value={targetMb}
                onChange={(e) => setTargetMb(Number(e.target.value))}
                disabled={busy}
                className="mt-2 w-full accent-[var(--accent)]"
              />
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                Bitrate is computed per file from its individual duration.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto space-y-1 rounded-glass border border-white/5 bg-white/[0.02] p-2 font-mono text-[10px]">
              {results.map((r, i) => (
                <li
                  key={i}
                  className={r.ok ? "text-emerald-300" : "text-red-300"}
                >
                  {r.ok ? "✓" : "✗"} {basename(r.path)} — {r.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/5 p-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-glass px-4 py-2 text-sm text-zinc-400 hover:bg-white/5 disabled:opacity-30"
          >
            Close
          </button>
          <button
            onClick={run}
            disabled={busy || selected.length === 0}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Run ({selected.length})
          </button>
        </footer>
      </div>
    </div>
  );
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}
