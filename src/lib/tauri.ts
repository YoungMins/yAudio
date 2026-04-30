import type {
  AudioMeta,
  MagicLinkResult,
  SilenceRange,
  WaveformPayload,
} from "../types/audio";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<InvokeFn | null> {
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in window) && !("__TAURI__" in window)) {
    return null;
  }
  try {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke as InvokeFn;
  } catch {
    return null;
  }
}

async function invokeOrMock<T>(
  cmd: string,
  args: Record<string, unknown>,
  mock: () => T
): Promise<T> {
  const invoke = await getInvoke();
  if (!invoke) return mock();
  return invoke<T>(cmd, args);
}

export const tauri = {
  loadAudio: (path: string) =>
    invokeOrMock<AudioMeta>("load_audio", { path }, () => mockMeta(path)),

  extractWaveform: (path: string, targetPoints: number) =>
    invokeOrMock<WaveformPayload>(
      "extract_waveform",
      { path, targetPoints },
      () => mockWaveform(path, targetPoints)
    ),

  convertAudio: (
    input: string,
    output: string,
    format: string,
    bitrateKbps?: number
  ) =>
    invokeOrMock<{ output: string; bitrate_kbps: number | null }>(
      "convert_audio",
      { input, output, format, bitrateKbps },
      () => ({ output, bitrate_kbps: bitrateKbps ?? null })
    ),

  estimateTargetBitrate: (durationSecs: number, targetMb: number) =>
    invokeOrMock<number>(
      "estimate_target_bitrate",
      { durationSecs, targetMb },
      () => {
        if (durationSecs <= 0) return 128;
        const bits = targetMb * 1024 * 1024 * 8 * 0.95;
        const kbps = Math.round(bits / durationSecs / 1000);
        return Math.max(32, Math.min(320, kbps));
      }
    ),

  detectSilence: (path: string, thresholdDb: number, minDurationMs: number) =>
    invokeOrMock<SilenceRange[]>(
      "detect_silence",
      { path, thresholdDb, minDurationMs },
      () => []
    ),

  magicLinkExtract: (url: string) =>
    invokeOrMock<MagicLinkResult>("magic_link_extract", { url }, () => ({
      local_path: `/tmp/yaudio/${encodeURIComponent(url).slice(0, 32)}.wav`,
      title: null,
    })),
};

function mockMeta(path: string): AudioMeta {
  return {
    path,
    duration_secs: 184.32,
    sample_rate: 44_100,
    channels: 2,
    codec: "mock",
    size_bytes: 4_521_984,
  };
}

function mockWaveform(path: string, n: number): WaveformPayload {
  const buckets = Math.max(1, n);
  const peaks = new Array(buckets * 2).fill(0);
  for (let i = 0; i < buckets; i++) {
    const t = i / buckets;
    const env =
      Math.sin(t * Math.PI) *
      (0.4 + 0.4 * Math.sin(t * Math.PI * 12) * Math.cos(t * 9));
    const noise = (Math.random() - 0.5) * 0.1;
    peaks[i * 2] = -Math.abs(env) - Math.abs(noise);
    peaks[i * 2 + 1] = Math.abs(env) + Math.abs(noise);
  }
  return {
    meta: mockMeta(path),
    peaks,
    bucket_count: buckets,
  };
}
