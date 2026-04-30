import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatBytes } from "../lib/format";
import { tauri } from "../lib/tauri";
import { useApp } from "../store/appStore";
import type { ModelInfo, ModelStatus } from "../types/audio";

function StatusBadge({ status }: { status: ModelStatus }) {
  const map: Record<ModelStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    installed: {
      label: "설치됨",
      cls: "bg-emerald-500/15 text-emerald-300",
      icon: <CheckCircle2 size={12} />,
    },
    notinstalled: {
      label: "미설치",
      cls: "bg-zinc-500/15 text-zinc-400",
      icon: <Download size={12} />,
    },
    downloading: {
      label: "다운로드 중",
      cls: "bg-violet-500/15 text-violet-300",
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    corrupted: {
      label: "손상됨",
      cls: "bg-amber-500/15 text-amber-300",
      icon: <AlertTriangle size={12} />,
    },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${v.cls}`}
    >
      {v.icon}
      {v.label}
    </span>
  );
}

export function ModelManager() {
  const open = useApp((s) => s.modelManagerOpen);
  const close = useApp((s) => s.closeModelManager);
  const models = useApp((s) => s.models);
  const setModels = useApp((s) => s.setModels);
  const progress = useApp((s) => s.modelProgress);
  const setProgress = useApp((s) => s.setModelProgress);
  const highlight = useApp((s) => s.highlightedModel);

  const [dir, setDir] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const [list, d] = await Promise.all([tauri.listModels(), tauri.modelsDir()]);
      setModels(list);
      setDir(d);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onDownload(m: ModelInfo) {
    setProgress({
      id: m.id,
      received: 0,
      total: m.size_bytes,
      done: false,
      error: null,
    });
    try {
      await tauri.downloadModel(m.id, (p) => setProgress(p));
    } catch (e) {
      setProgress({
        id: m.id,
        received: 0,
        total: m.size_bytes,
        done: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await refresh();
    }
  }

  async function onDelete(m: ModelInfo) {
    await tauri.deleteModel(m.id);
    await refresh();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="glass flex max-h-[85vh] w-[640px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/5 p-5">
          <div>
            <h2 className="text-base font-semibold">AI 모델 매니저</h2>
            <p className="mt-1 text-xs text-zinc-500">
              모델은 사용자 기기에만 저장되며 외부 서버로 전송되지 않습니다.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={refresh}
              className="tool-btn h-8 w-8"
              title="Refresh"
              disabled={refreshing}
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
            <button onClick={close} className="tool-btn h-8 w-8">
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-2 font-mono text-[11px] text-zinc-500">
          <HardDrive size={12} />
          <span className="truncate">{dir || "—"}</span>
        </div>

        <ul className="flex-1 space-y-3 overflow-y-auto p-5">
          {models.length === 0 && (
            <li className="text-center text-sm text-zinc-500">
              {refreshing ? "불러오는 중…" : "등록된 모델이 없습니다."}
            </li>
          )}
          {models.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              progress={progress[m.id]}
              highlighted={m.id === highlight}
              onDownload={() => onDownload(m)}
              onDelete={() => onDelete(m)}
            />
          ))}
        </ul>

        <footer className="border-t border-white/5 px-5 py-3 text-[11px] text-zinc-500">
          모델 라이선스를 확인 후 사용하세요. yAudio는 가중치를 재배포하지 않으며
          공식 배포처에서 직접 다운로드합니다.
        </footer>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  progress,
  highlighted,
  onDownload,
  onDelete,
}: {
  model: ModelInfo;
  progress?: { received: number; total: number; done: boolean; error: string | null };
  highlighted: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const isDownloading = useMemo(
    () => model.status === "downloading" || (progress && !progress.done && !progress.error),
    [model.status, progress]
  );
  const pct = progress
    ? Math.min(100, Math.round((progress.received / Math.max(1, progress.total)) * 100))
    : 0;

  return (
    <li
      className={`rounded-glass border p-4 transition ${
        highlighted
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-white/5 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-zinc-100">
              {model.name}
            </h3>
            <StatusBadge status={isDownloading ? "downloading" : model.status} />
          </div>
          <p className="mt-1 text-xs text-zinc-400">{model.purpose}</p>
          <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-zinc-500">
            <span>~{formatBytes(model.size_bytes)}</span>
            <span>·</span>
            <span>{model.license}</span>
            {model.on_disk_bytes ? (
              <>
                <span>·</span>
                <span>on disk: {formatBytes(model.on_disk_bytes)}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {model.status === "installed" && (
            <button
              onClick={onDelete}
              className="tool-btn h-8 w-8"
              title="Remove"
            >
              <Trash2 size={14} />
            </button>
          )}
          {model.status !== "installed" && (
            <button
              disabled={!!isDownloading}
              onClick={onDownload}
              className="btn-primary flex items-center gap-2 text-xs"
            >
              {isDownloading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {model.status === "corrupted" ? "재다운로드" : "다운로드"}
            </button>
          )}
        </div>
      </div>

      {(isDownloading || progress?.error) && (
        <div className="mt-3">
          {progress?.error ? (
            <p className="text-xs text-red-300">{progress.error}</p>
          ) : (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full accent-bg transition-[width] duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
                <span>{pct}%</span>
                <span>
                  {formatBytes(progress?.received ?? 0)} /{" "}
                  {formatBytes(progress?.total ?? model.size_bytes)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
