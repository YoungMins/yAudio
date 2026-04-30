/**
 * Format a duration in seconds as `MM:SS.cc` (centiseconds).
 *
 * Negative or non-finite inputs collapse to "00:00.00" so the UI stays
 * stable when audio metadata is missing or in flight.
 */
export function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "00:00.00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const cs = Math.floor((secs - Math.floor(secs)) * 100);
  return `${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/**
 * Human-readable byte size. Falls back to em-dash for missing/zero values
 * so it can render directly in cells.
 */
export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  const mb = n / 1024 / 1024;
  if (mb < 1) return `${(n / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Mirror of `yaudio-core`'s estimate_bitrate. Used by the in-browser
 * preview when the Tauri backend isn't running. Kept as a separate copy
 * intentionally — the canonical implementation is the Rust version.
 */
export function estimateBitrate(durationSecs: number, targetMb: number): number {
  if (durationSecs <= 0 || targetMb <= 0) return 128;
  const bits = targetMb * 1024 * 1024 * 8 * 0.95;
  const kbps = Math.round(bits / durationSecs / 1000);
  return Math.max(32, Math.min(320, kbps));
}
