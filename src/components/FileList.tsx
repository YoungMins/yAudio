import {
  CheckSquare,
  FilePlus2,
  FileX,
  Music,
  Package,
  Sparkles,
  Square,
  VolumeX,
} from "lucide-react";
import { useMemo } from "react";
import { formatBytes, formatTime } from "../lib/format";
import { useApp } from "../store/appStore";

interface Props {
  onAddFiles: () => void;
  onBatchExport: () => void;
  onBatchClean: () => void;
  onBatchTrimSilence: () => void;
  busy?: { label: string; current: number; total: number } | null;
}

/**
 * Left-side library panel. Lists every loaded file as a row that doubles
 * as the active-document picker; checkboxes drive batch selection. The
 * footer surfaces the batch operations supplied by App.
 */
export function FileList({
  onAddFiles,
  onBatchExport,
  onBatchClean,
  onBatchTrimSilence,
  busy,
}: Props) {
  const library = useApp((s) => s.library);
  const activeId = useApp((s) => s.activeId);
  const setActive = useApp((s) => s.setActiveDocument);
  const remove = useApp((s) => s.removeDocument);
  const toggle = useApp((s) => s.toggleBatchSelection);
  const selectAll = useApp((s) => s.selectAllForBatch);
  const clearAll = useApp((s) => s.clearBatchSelection);

  const selectedCount = useMemo(
    () => library.filter((d) => d.selectedForBatch).length,
    [library]
  );
  const allSelected = library.length > 0 && selectedCount === library.length;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/5">
      <div className="flex h-9 items-center gap-1 border-b border-white/5 px-3 text-xs">
        <span className="font-semibold text-zinc-300">Files</span>
        <span className="font-mono text-zinc-500">({library.length})</span>
        <button
          onClick={onAddFiles}
          className="ml-auto tool-btn h-7 w-7"
          title="Open audio files…"
        >
          <FilePlus2 size={14} />
        </button>
        <button
          onClick={() => (allSelected ? clearAll() : selectAll())}
          disabled={library.length === 0}
          className="tool-btn h-7 w-7 disabled:opacity-30"
          title={allSelected ? "Clear selection" : "Select all"}
        >
          {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {library.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-zinc-500">
            Drop audio files here
            <br />
            or click <FilePlus2 size={12} className="inline" /> to add
          </li>
        )}
        {library.map((d) => {
          const isActive = d.id === activeId;
          return (
            <li
              key={d.id}
              onClick={() => setActive(d.id)}
              className={`group flex cursor-pointer items-center gap-2 px-2 py-1.5 ${
                isActive ? "bg-[var(--accent)]/15" : "hover:bg-white/5"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(d.id);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center"
                title="Select for batch action"
              >
                {d.selectedForBatch ? (
                  <CheckSquare size={14} className="accent" />
                ) : (
                  <Square size={14} className="text-zinc-500" />
                )}
              </button>
              <Music
                size={14}
                className={`shrink-0 ${isActive ? "accent" : "text-zinc-500"}`}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-xs ${
                    isActive ? "text-zinc-100" : "text-zinc-300"
                  }`}
                  title={d.meta.path}
                >
                  {basename(d.meta.path)}
                </div>
                <div className="font-mono text-[10px] text-zinc-500">
                  {formatTime(d.meta.duration_secs)} ·{" "}
                  {formatBytes(d.meta.size_bytes)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(d.id);
                }}
                className="tool-btn h-6 w-6 opacity-0 group-hover:opacity-100"
                title="Remove from library"
              >
                <FileX size={12} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-white/5 px-3 py-2 text-[11px]">
        {busy ? (
          <div className="space-y-1">
            <p className="text-zinc-300">{busy.label}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full accent-bg transition-[width] duration-150"
                style={{
                  width: `${Math.min(100, Math.round((busy.current / Math.max(1, busy.total)) * 100))}%`,
                }}
              />
            </div>
            <p className="text-right font-mono text-[10px] text-zinc-500">
              {busy.current}/{busy.total}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-1 text-zinc-500">
              Batch <span className="font-mono text-zinc-400">({selectedCount})</span>
            </p>
            <div className="grid grid-cols-3 gap-1">
              <BatchBtn
                onClick={onBatchExport}
                disabled={selectedCount === 0}
                label="Export"
                icon={<Package size={12} />}
              />
              <BatchBtn
                onClick={onBatchClean}
                disabled={selectedCount === 0}
                label="Clean"
                icon={<Sparkles size={12} />}
              />
              <BatchBtn
                onClick={onBatchTrimSilence}
                disabled={selectedCount === 0}
                label="Trim"
                icon={<VolumeX size={12} />}
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function BatchBtn({
  onClick,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-0.5 rounded-glass border border-white/5 bg-white/[0.02] py-1.5 text-[10px] transition hover:bg-white/5 disabled:opacity-30"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}
