import { Loader2, Waves, X } from "lucide-react";
import { useState } from "react";
import { useApp } from "../store/appStore";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Reports progress so the parent can render a global indicator. */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Apply a single Fade In / Fade Out duration to every batch-selected
 * document. Each doc's first clip receives fade-in, its last clip
 * receives fade-out, with values clamped to clip duration.
 */
export function BatchFadeDialog({ open, onClose, onProgress }: Props) {
  const library = useApp((s) => s.library);
  const setActiveDocument = useApp((s) => s.setActiveDocument);
  const activeId = useApp((s) => s.activeId);
  const [fadeIn, setFadeIn] = useState(1);
  const [fadeOut, setFadeOut] = useState(1);
  const [busy, setBusy] = useState(false);

  const selected = library.filter((d) => d.selectedForBatch);

  if (!open) return null;

  function run() {
    setBusy(true);
    onProgress?.(0, selected.length);
    for (let i = 0; i < selected.length; i++) {
      const doc = selected[i];
      doc.timeline.applyTimelineFadeIn(fadeIn);
      doc.timeline.applyTimelineFadeOut(fadeOut);
      onProgress?.(i + 1, selected.length);
    }
    // If the active doc was modified, refresh the root mirror so the
    // Inspector / canvas reflect the new fades immediately.
    if (activeId && selected.some((d) => d.id === activeId)) {
      setActiveDocument(activeId);
    }
    setBusy(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="glass w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2">
            <Waves size={18} className="accent" />
            <h2 className="text-base font-semibold">Batch Fade</h2>
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
            Apply the same Fade In / Fade Out across {selected.length} file
            {selected.length === 1 ? "" : "s"}.
          </p>

          <FadeRow
            label="Fade In"
            value={fadeIn}
            onChange={setFadeIn}
            disabled={busy}
          />
          <FadeRow
            label="Fade Out"
            value={fadeOut}
            onChange={setFadeOut}
            disabled={busy}
          />
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/5 p-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-glass px-4 py-2 text-sm text-zinc-400 hover:bg-white/5 disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            onClick={run}
            disabled={busy || selected.length === 0}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Apply ({selected.length})
          </button>
        </footer>
      </div>
    </div>
  );
}

function FadeRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="flex items-center justify-between">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono accent">{value.toFixed(2)} s</span>
      </label>
      <input
        type="range"
        min={0}
        max={10}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </div>
  );
}
