export interface AudioMeta {
  path: string;
  duration_secs: number;
  sample_rate: number;
  channels: number;
  codec: string;
  size_bytes: number;
}

export interface WaveformPayload {
  meta: AudioMeta;
  /** Interleaved [min0, max0, min1, max1, ...] in [-1, 1]. */
  peaks: number[];
  bucket_count: number;
}

export interface SilenceRange {
  start_secs: number;
  end_secs: number;
}

export interface MagicLinkResult {
  local_path: string;
  title: string | null;
}

export type AudioFormat = "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a";

export type Tool = "select" | "cut" | "zoom";

export type ModelStatus =
  | "notinstalled"
  | "downloading"
  | "installed"
  | "corrupted";

export interface ModelInfo {
  id: string;
  name: string;
  purpose: string;
  /** `null` means the model is import-only (no public URL). */
  url: string | null;
  filename: string;
  size_bytes: number;
  sha256: string | null;
  license: string;
  status: ModelStatus;
  local_path: string | null;
  on_disk_bytes: number | null;
}

export interface DownloadProgress {
  id: string;
  received: number;
  total: number;
  done: boolean;
  error: string | null;
}

/** Map AI feature → required model id. */
export const MODEL_FOR_FEATURE = {
  clean: "rnnoise",
  split: "demucs-htdemucs",
  vad: "silero-vad",
} as const;
export type AiFeature = keyof typeof MODEL_FOR_FEATURE;
