import {
  Activity,
  Gauge,
  Layers,
  Loader2,
  Power,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Volume2,
  Wand2,
  Waves,
} from "lucide-react";
import { useEffect, useState } from "react";
import { normalizationGainDb, peakOfWaveform } from "../lib/audioMath";
import { tauri } from "../lib/tauri";
import { toExportClip, type CompressorState } from "../lib/timeline";
import { useApp } from "../store/appStore";
import type { AudioFormat } from "../types/audio";

const FADE_PRESETS = [
  { label: "Off", value: 0 },
  { label: "Short", value: 0.5 },
  { label: "Medium", value: 1.5 },
  { label: "Long", value: 3 },
];

const FORMATS: AudioFormat[] = ["mp3", "wav", "flac", "ogg", "aac", "m4a"];

export function Inspector() {
  const meta = useApp((s) => s.meta);
  const effects = useApp((s) => s.effects);
  const toggleEffect = useApp((s) => s.toggleEffect);
  const silences = useApp((s) => s.silences);
  const setSilences = useApp((s) => s.setSilences);
  const clips = useApp((s) => s.clips);
  const timeline = useApp((s) => s.timeline);
  const mutateTimeline = useApp((s) => s.mutateTimeline);

  const waveform = useApp((s) => s.waveform);

  // Read live fade values from the active timeline. The first/last clip's
  // fade-in/fade-out is the "track envelope".
  const fadeIn = timeline.timelineFadeIn;
  const fadeOut = timeline.timelineFadeOut;
  const trackGainDb = timeline.timelineGainDb;
  const eq = timeline.timelineEq;
  const comp = timeline.timelineCompressor;
  const totalDur = meta?.duration_secs ?? 0;
  const fadeMax = Math.max(0.1, Math.min(10, totalDur / 2));

  function updateCompressor(patch: Partial<CompressorState>) {
    mutateTimeline((t) =>
      t.applyTimelineCompressor({ ...comp, ...patch })
    );
  }

  function setEqBand(band: "low" | "mid" | "high", value: number) {
    mutateTimeline((t) =>
      t.applyTimelineEq(
        band === "low" ? value : eq.low,
        band === "mid" ? value : eq.mid,
        band === "high" ? value : eq.high
      )
    );
  }

  function runNormalize() {
    if (!waveform) return;
    const peak = peakOfWaveform(waveform.peaks);
    const target = -1; // dBFS — leave 1 dB of headroom
    const db = Math.max(-24, Math.min(12, normalizationGainDb(peak, target)));
    mutateTimeline((t) => t.applyTimelineGainDb(db));
  }

  const [targetMb, setTargetMb] = useState(3);
  const [estimatedKbps, setEstimatedKbps] = useState<number | null>(null);
  const [format, setFormat] = useState<AudioFormat>("mp3");
  const [silenceDb, setSilenceDb] = useState(-40);
  const [silenceMs, setSilenceMs] = useState(500);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

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

  // Allow the global File menu to trigger an export.
  useEffect(() => {
    const handler = () => void runExport();
    window.addEventListener("yaudio:export", handler as EventListener);
    return () => window.removeEventListener("yaudio:export", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, clips, format, estimatedKbps]);

  async function runExport() {
    if (!meta || clips.length === 0) return;
    setExporting(true);
    setExportMsg(null);
    try {
      let outPath = `${meta.path.replace(/\.[^/.]+$/, "")}.export.${format}`;
      try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const picked = await dialog.save({
          defaultPath: outPath,
          filters: [{ name: format.toUpperCase(), extensions: [format] }],
        });
        if (typeof picked === "string") outPath = picked;
        else {
          setExporting(false);
          return;
        }
      } catch {
        // browser preview: just keep the synthetic path
      }
      const result = await tauri.exportTimeline(
        clips.map(toExportClip),
        outPath,
        format === "wav" ? undefined : format,
        estimatedKbps ?? undefined
      );
      setExportMsg(`✓ ${result}`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 p-4 text-sm">
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

      <Section title="Fade In / Out" icon={<Waves size={14} />}>
        {meta && clips.length > 0 ? (
          <div className="space-y-3 text-xs">
            <FadeControl
              label="Fade In"
              value={fadeIn}
              max={fadeMax}
              onChange={(v) =>
                mutateTimeline((t) => t.applyTimelineFadeIn(v))
              }
            />
            <FadeControl
              label="Fade Out"
              value={fadeOut}
              max={fadeMax}
              onChange={(v) =>
                mutateTimeline((t) => t.applyTimelineFadeOut(v))
              }
            />
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Presets</span>
              <div className="flex gap-1">
                {FADE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() =>
                      mutateTimeline((t) => {
                        t.applyTimelineFadeIn(p.value);
                        t.applyTimelineFadeOut(p.value);
                      })
                    }
                    className="rounded border border-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/5"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">파일을 열면 페이드를 설정할 수 있습니다.</p>
        )}
      </Section>

      <Section title="Volume" icon={<Gauge size={14} />}>
        {meta && clips.length > 0 ? (
          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400">Track gain</span>
              <span className="font-mono accent">
                {trackGainDb >= 0 ? "+" : ""}
                {trackGainDb.toFixed(1)} dB
              </span>
            </label>
            <input
              type="range"
              min={-24}
              max={12}
              step={0.5}
              value={trackGainDb}
              onChange={(e) =>
                mutateTimeline((t) =>
                  t.applyTimelineGainDb(Number(e.target.value))
                )
              }
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex gap-1">
              <button
                onClick={runNormalize}
                className="btn-primary flex flex-1 items-center justify-center gap-1 py-1.5 text-[11px]"
                title="Set gain so the loudest peak hits about -1 dBFS"
              >
                <Wand2 size={12} /> Normalize
              </button>
              <button
                onClick={() => mutateTimeline((t) => t.applyTimelineGainDb(0))}
                className="rounded-glass border border-white/5 px-3 text-[11px] text-zinc-300 hover:bg-white/5"
                title="Reset to 0 dB"
              >
                <RotateCcw size={12} />
              </button>
            </div>
            {trackGainDb > 0 && (
              <p className="text-[10px] text-zinc-500">
                Boost above 0 dB plays at full strength — watch for clipping.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">파일을 열면 볼륨을 조절할 수 있습니다.</p>
        )}
      </Section>

      <Section title="Equalizer" icon={<SlidersHorizontal size={14} />}>
        {meta && clips.length > 0 ? (
          <div className="space-y-3 text-xs">
            <EqBand label="Low" hint="200 Hz shelf" value={eq.low} onChange={(v) => setEqBand("low", v)} />
            <EqBand label="Mid" hint="1 kHz peak" value={eq.mid} onChange={(v) => setEqBand("mid", v)} />
            <EqBand label="High" hint="4 kHz shelf" value={eq.high} onChange={(v) => setEqBand("high", v)} />
            <div className="flex items-center justify-between gap-1">
              <div className="flex gap-1">
                {[
                  { label: "Flat", v: [0, 0, 0] },
                  { label: "Bright", v: [-1, 0, 4] },
                  { label: "Warm", v: [4, 0, -2] },
                  { label: "Vocal", v: [-2, 3, 1] },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() =>
                      mutateTimeline((t) =>
                        t.applyTimelineEq(p.v[0], p.v[1], p.v[2])
                      )
                    }
                    className="rounded border border-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/5"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => mutateTimeline((t) => t.applyTimelineEq(0, 0, 0))}
                className="rounded-glass border border-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/5"
                title="Reset all bands"
              >
                <RotateCcw size={11} />
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Heard live during preview and applied identically on export.
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">파일을 열면 EQ를 조절할 수 있습니다.</p>
        )}
      </Section>

      <Section title="Compressor" icon={<Activity size={14} />}>
        {meta && clips.length > 0 ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Bypass</span>
              <button
                onClick={() => updateCompressor({ enabled: !comp.enabled })}
                className={`tool-btn h-7 px-2 text-[11px] ${
                  comp.enabled ? "active" : ""
                }`}
                style={{ width: "auto" }}
                title={comp.enabled ? "Disable compressor" : "Enable compressor"}
              >
                <Power size={12} className="mr-1" />
                {comp.enabled ? "On" : "Off"}
              </button>
            </div>
            <CompSlider
              label="Threshold"
              unit="dB"
              min={-60}
              max={0}
              step={0.5}
              value={comp.thresholdDb}
              disabled={!comp.enabled}
              onChange={(v) => updateCompressor({ thresholdDb: v })}
            />
            <CompSlider
              label="Ratio"
              unit=":1"
              min={1}
              max={20}
              step={0.1}
              value={comp.ratio}
              disabled={!comp.enabled}
              onChange={(v) => updateCompressor({ ratio: v })}
            />
            <CompSlider
              label="Attack"
              unit="ms"
              min={1}
              max={200}
              step={1}
              value={comp.attackMs}
              disabled={!comp.enabled}
              onChange={(v) => updateCompressor({ attackMs: v })}
            />
            <CompSlider
              label="Release"
              unit="ms"
              min={20}
              max={1000}
              step={10}
              value={comp.releaseMs}
              disabled={!comp.enabled}
              onChange={(v) => updateCompressor({ releaseMs: v })}
            />
            <CompSlider
              label="Make-up"
              unit="dB"
              min={-12}
              max={24}
              step={0.5}
              value={comp.makeupDb}
              disabled={!comp.enabled}
              onChange={(v) => updateCompressor({ makeupDb: v })}
            />
            <div className="flex gap-1">
              {[
                { label: "Subtle", v: { thresholdDb: -18, ratio: 2, attackMs: 20, releaseMs: 200, makeupDb: 1 } },
                { label: "Vocal", v: { thresholdDb: -16, ratio: 4, attackMs: 5, releaseMs: 60, makeupDb: 3 } },
                { label: "Punch", v: { thresholdDb: -10, ratio: 6, attackMs: 30, releaseMs: 100, makeupDb: 4 } },
                { label: "Limiter", v: { thresholdDb: -3, ratio: 20, attackMs: 1, releaseMs: 50, makeupDb: 0 } },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => updateCompressor({ enabled: true, ...p.v })}
                  className="rounded border border-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/5"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">파일을 열면 컴프레서를 사용할 수 있습니다.</p>
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
            disabled={!meta || exporting || clips.length === 0}
            className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
            onClick={runExport}
          >
            {exporting && <Loader2 size={14} className="animate-spin" />}
            Export ({clips.length} clip{clips.length === 1 ? "" : "s"})
          </button>
          {exportMsg && (
            <p
              className={`mt-1 break-words text-[11px] ${
                exportMsg.startsWith("✓") ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {exportMsg}
            </p>
          )}
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
          {comp.enabled && (
            <li className="glass flex items-center justify-between px-3 py-2">
              <span className="text-xs">
                Compressor{" "}
                <span className="font-mono text-zinc-500">
                  {comp.thresholdDb.toFixed(0)} dB · {comp.ratio.toFixed(1)}:1
                </span>
              </span>
              <button
                onClick={() => updateCompressor({ enabled: false })}
                className="tool-btn h-7 w-7"
                title="Bypass compressor"
              >
                <Power size={12} />
              </button>
            </li>
          )}
          {(Math.abs(eq.low) > 1e-3 || Math.abs(eq.mid) > 1e-3 || Math.abs(eq.high) > 1e-3) && (
            <li className="glass flex items-center justify-between px-3 py-2">
              <span className="text-xs">
                EQ{" "}
                <span className="font-mono text-zinc-500">
                  {fmtBand(eq.low)} / {fmtBand(eq.mid)} / {fmtBand(eq.high)}
                </span>
              </span>
              <button
                onClick={() => mutateTimeline((t) => t.applyTimelineEq(0, 0, 0))}
                className="tool-btn h-7 w-7"
                title="Reset EQ"
              >
                <RotateCcw size={12} />
              </button>
            </li>
          )}
          {Math.abs(trackGainDb) > 1e-3 && (
            <li className="glass flex items-center justify-between px-3 py-2">
              <span className="text-xs">
                Volume{" "}
                <span className="font-mono text-zinc-500">
                  {trackGainDb >= 0 ? "+" : ""}
                  {trackGainDb.toFixed(1)} dB
                </span>
              </span>
              <button
                onClick={() => mutateTimeline((t) => t.applyTimelineGainDb(0))}
                className="tool-btn h-7 w-7"
                title="Reset volume"
              >
                <RotateCcw size={12} />
              </button>
            </li>
          )}
          {fadeIn > 0 && (
            <li className="glass flex items-center justify-between px-3 py-2">
              <span className="text-xs">
                Fade In <span className="font-mono text-zinc-500">{fadeIn.toFixed(2)}s</span>
              </span>
              <button
                onClick={() => mutateTimeline((t) => t.applyTimelineFadeIn(0))}
                className="tool-btn h-7 w-7"
                title="Clear fade in"
              >
                <RotateCcw size={12} />
              </button>
            </li>
          )}
          {fadeOut > 0 && (
            <li className="glass flex items-center justify-between px-3 py-2">
              <span className="text-xs">
                Fade Out <span className="font-mono text-zinc-500">{fadeOut.toFixed(2)}s</span>
              </span>
              <button
                onClick={() => mutateTimeline((t) => t.applyTimelineFadeOut(0))}
                className="tool-btn h-7 w-7"
                title="Clear fade out"
              >
                <RotateCcw size={12} />
              </button>
            </li>
          )}
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
          {effects.length === 0 &&
            fadeIn === 0 &&
            fadeOut === 0 &&
            !comp.enabled &&
            Math.abs(trackGainDb) < 1e-3 &&
            Math.abs(eq.low) < 1e-3 &&
            Math.abs(eq.mid) < 1e-3 &&
            Math.abs(eq.high) < 1e-3 && (
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

function FadeControl({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
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
        max={max}
        step={0.05}
        value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function fmtBand(db: number): string {
  if (Math.abs(db) < 1e-3) return "0";
  return `${db >= 0 ? "+" : ""}${db.toFixed(1)}`;
}

function CompSlider({
  label,
  unit,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <label className="flex items-center justify-between">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono accent">
          {value.toFixed(unit === ":1" ? 1 : unit === "ms" ? 0 : 1)} {unit}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function EqBand({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="flex items-center justify-between">
        <span className="text-zinc-400">
          {label} <span className="text-zinc-600">· {hint}</span>
        </span>
        <span className="font-mono accent">
          {value >= 0 ? "+" : ""}
          {value.toFixed(1)} dB
        </span>
      </label>
      <input
        type="range"
        min={-12}
        max={12}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </div>
  );
}
