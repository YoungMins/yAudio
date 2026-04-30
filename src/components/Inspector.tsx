import { Layers, Power, Scissors, Trash2, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { tauri } from "../lib/tauri";
import { useApp } from "../store/appStore";
import type { AudioFormat } from "../types/audio";

const FORMATS: AudioFormat[] = ["mp3", "wav", "flac", "ogg", "aac", "m4a"];

export function Inspector() {
  const meta = useApp((s) => s.meta);
  const effects = useApp((s) => s.effects);
  const toggleEffect = useApp((s) => s.toggleEffect);
  const silences = useApp((s) => s.silences);
  const setSilences = useApp((s) => s.setSilences);
  const clips = useApp((s) => s.clips);
  const timeline = useApp((s) => s.timeline);

  const [targetMb, setTargetMb] = useState(3);
  const [estimatedKbps, setEstimatedKbps] = useState<number | null>(null);
  const [format, setFormat] = useState<AudioFormat>("mp3");
  const [silenceDb, setSilenceDb] = useState(-40);
  const [silenceMs, setSilenceMs] = useState(500);

  useEffect(() => {
    let cancelled = false;
    if (!meta) {
      setEstimatedKbps(null);
      return;
    }
    tauri
      .estimateTargetBitrate(meta.duration_secs, targetMb)
      .then((k) => {
        if (!cancelled) setEstimatedKbps(k);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [meta, targetMb]);

  async function runSilenceDetect() {
    if (!meta) return;
    const ranges = await tauri.detectSilence(meta.path, silenceDb, silenceMs);
    setSilences(ranges);
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-white/5 p-4 text-sm">
      <Section title="File">
        {meta ? (
          <dl className="space-y-1 font-mono text-xs text-zinc-400">
            <Row k="Duration" v={`${meta.duration_secs.toFixed(2)}s`} />
            <Row k="Sample Rate" v={`${meta.sample_rate} Hz`} />
            <Row k="Channels" v={`${meta.channels}`} />
            <Row k="Size" v={`${(meta.size_bytes / 1024 / 1024).toFixed(2)} MB`} />
          </dl>
        ) : (
          <p className="text-xs text-zinc-500">로드된 파일이 없습니다.</p>
        )}
      </Section>

      <Section title="Timeline" icon={<Scissors size={14} />}>
        {meta ? (
          <dl className="space-y-1 font-mono text-xs text-zinc-400">
            <Row k="Clips" v={`${clips.length}`} />
            <Row k="Edited length" v={`${timeline.duration.toFixed(2)}s`} />
            <Row
              k="Trimmed"
              v={`${Math.max(0, meta.duration_secs - timeline.duration).toFixed(2)}s`}
            />
          </dl>
        ) : (
          <p className="text-xs text-zinc-500">파일을 열면 클립이 생성됩니다.</p>
        )}
      </Section>

      <Section title="Smart Compression" icon={<Volume2 size={14} />}>
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Target size</span>
            <span className="font-mono accent">{targetMb.toFixed(1)} MB</span>
          </label>
          <input
            type="range"
            min={0.5}
            max={50}
            step={0.5}
            value={targetMb}
            onChange={(e) => setTargetMb(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Estimated bitrate</span>
            <span className="font-mono">
              {estimatedKbps !== null ? `${estimatedKbps} kbps` : "—"}
            </span>
          </div>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as AudioFormat)}
            className="input text-xs"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            disabled={!meta}
            className="btn-primary w-full text-sm"
            onClick={() => alert(`Convert → ${format.toUpperCase()} @ ${estimatedKbps ?? "—"} kbps`)}
          >
            Export
          </button>
        </div>
      </Section>

      <Section title="Silence Trim">
        <div className="space-y-2 text-xs">
          <label className="flex items-center justify-between">
            <span className="text-zinc-400">Threshold</span>
            <span className="font-mono accent">{silenceDb} dB</span>
          </label>
          <input
            type="range"
            min={-80}
            max={-10}
            step={1}
            value={silenceDb}
            onChange={(e) => setSilenceDb(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <label className="flex items-center justify-between">
            <span className="text-zinc-400">Min duration</span>
            <span className="font-mono accent">{silenceMs} ms</span>
          </label>
          <input
            type="range"
            min={50}
            max={3000}
            step={50}
            value={silenceMs}
            onChange={(e) => setSilenceMs(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <button
            disabled={!meta}
            onClick={runSilenceDetect}
            className="btn-primary w-full"
          >
            Detect & Mark
          </button>
          {silences.length > 0 && (
            <p className="text-zinc-500">
              {silences.length}개의 무음 구간 감지됨
            </p>
          )}
        </div>
      </Section>

      <Section title="Effect Stack" icon={<Layers size={14} />}>
        <ul className="space-y-1">
          {effects.map((e) => (
            <li
              key={e.id}
              className="glass flex items-center justify-between px-3 py-2"
            >
              <span className="text-xs">{e.name}</span>
              <button
                onClick={() => toggleEffect(e.id)}
                className={`tool-btn h-7 w-7 ${e.enabled ? "active" : ""}`}
                title="Toggle"
              >
                <Power size={12} />
              </button>
            </li>
          ))}
          {effects.length === 0 && (
            <li className="flex items-center gap-2 text-xs text-zinc-500">
              <Trash2 size={12} /> 효과가 비어 있습니다.
            </li>
          )}
        </ul>
      </Section>
    </aside>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-3">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{k}</dt>
      <dd className="text-zinc-200">{v}</dd>
    </div>
  );
}
