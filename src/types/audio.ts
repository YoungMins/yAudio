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
