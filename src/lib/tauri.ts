import type {
  AudioMeta,
  DownloadProgress,
  MagicLinkResult,
  ModelInfo,
  SilenceRange,
  WaveformPayload,
} from "../types/audio";
import { estimateBitrate } from "./format";

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
      () => estimateBitrate(durationSecs, targetMb)
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

  listModels: () => invokeOrMock<ModelInfo[]>("list_models", {}, mockModels),

  downloadModel: async (id: string, onProgress?: (p: DownloadProgress) => void) => {
    const invoke = await getInvoke();
    if (!invoke) {
      // browser preview: simulate a 2-second download for UX testing
      return mockDownload(id, onProgress);
    }
    let unlisten: (() => void) | undefined;
    if (onProgress) {
      const event = await import("@tauri-apps/api/event");
      unlisten = await event.listen<DownloadProgress>("model:progress", (e) => {
        if (e.payload.id === id) onProgress(e.payload);
      });
    }
    try {
      await invoke<void>("download_model", { id });
    } finally {
      unlisten?.();
    }
  },

  deleteModel: (id: string) =>
    invokeOrMock<void>("delete_model", { id }, () => undefined as void),

  importModel: (id: string, sourcePath: string) =>
    invokeOrMock<void>(
      "import_model",
      { id, sourcePath },
      () => undefined as void
    ),

  modelsDir: () =>
    invokeOrMock<string>("models_dir", {}, () => "(browser preview)"),

  runAi: (modelId: string, inputPath: string) =>
    invokeOrMock<{ model_id: string; output_path: string }>(
      "run_ai",
      { modelId, inputPath },
      () => ({ model_id: modelId, output_path: `${inputPath}.processed.wav` })
    ),

  exportTimeline: (
    clips: ExportClip[],
    output: string,
    convertTo?: string,
    bitrateKbps?: number
  ) =>
    invokeOrMock<string>(
      "export_timeline",
      { clips, output, convertTo, bitrateKbps },
      () => output
    ),
};

/**
 * Wire-format expected by `export_timeline`. Mirrors `yaudio_core::Clip`
 * (snake_case) since serde uses field names verbatim.
 */
export interface ExportClip {
  id: number;
  source_path: string;
  start: number;
  duration: number;
  source_offset: number;
  fade_in: number;
  fade_out: number;
  gain_db: number;
}

function mockModels(): ModelInfo[] {
  return [
    {
      id: "rnnoise",
      name: "RNNoise (ONNX)",
      purpose: "AI Noise Clean — voice / ambient denoising",
      url: "https://huggingface.co/onnx-community/rnnoise/resolve/main/rnnoise.onnx",
      filename: "rnnoise.onnx",
      size_bytes: 2_300_000,
      sha256: null,
      license: "BSD-3-Clause",
      status: "notinstalled",
      local_path: null,
      on_disk_bytes: null,
    },
    {
      id: "demucs-htdemucs",
      name: "Demucs htdemucs (ONNX)",
      purpose: "AI Stem Split — vocals / drums / bass / other",
      url: null,
      filename: "htdemucs.onnx",
      size_bytes: 83_000_000,
      sha256: null,
      license: "MIT",
      status: "notinstalled",
      local_path: null,
      on_disk_bytes: null,
    },
    {
      id: "silero-vad",
      name: "Silero VAD",
      purpose: "Smart silence detection — voice activity",
      url: "https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx",
      filename: "silero_vad.onnx",
      size_bytes: 1_800_000,
      sha256: null,
      license: "MIT",
      status: "notinstalled",
      local_path: null,
      on_disk_bytes: null,
    },
  ];
}

async function mockDownload(
  id: string,
  onProgress?: (p: DownloadProgress) => void
) {
  const total = 2_000_000;
  for (let i = 0; i <= 20; i++) {
    await new Promise((r) => setTimeout(r, 90));
    onProgress?.({
      id,
      received: Math.round((total * i) / 20),
      total,
      done: i === 20,
      error: null,
    });
  }
}

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
