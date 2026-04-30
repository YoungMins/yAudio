import { Link2, Loader2, X } from "lucide-react";
import { useState } from "react";
import { tauri } from "../lib/tauri";
import { useApp } from "../store/appStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MagicLinkDialog({ open, onClose }: Props) {
  const setWaveform = useApp((s) => s.setWaveform);
  const addEffect = useApp((s) => s.addEffect);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [stem, setStem] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { local_path } = await tauri.magicLinkExtract(url);
      const wf = await tauri.extractWaveform(local_path, 2_000);
      setWaveform(wf);
      if (stem) addEffect("AI Stem Split (queued)");
      onClose();
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-[480px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="accent" />
            <h2 className="text-base font-semibold">AI Magic Link</h2>
          </div>
          <button onClick={onClose} className="tool-btn h-8 w-8">
            <X size={14} />
          </button>
        </header>

        <p className="mb-3 text-xs text-zinc-500">
          외부 URL을 입력하면 로컬 <code>yt-dlp</code>가 오디오를 추출하고
          타임라인에 자동 배치합니다. 외부 서버에 데이터가 전송되지 않습니다.
        </p>

        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="input mb-3 font-mono text-sm"
          disabled={busy}
        />

        <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={stem}
            onChange={(e) => setStem(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          추출 후 자동으로 음원 분리(Stem Split) 실행
        </label>

        {error && (
          <p className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-glass px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
          >
            취소
          </button>
          <button
            disabled={busy || !url.trim()}
            onClick={run}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            추출하기
          </button>
        </div>
      </div>
    </div>
  );
}
