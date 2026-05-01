import { useEffect, useRef } from "react";
import { useApp } from "../store/appStore";

/**
 * Owns the single `<audio>` element used for playback. Returns the
 * element to mount somewhere in the tree (it has no UI of its own).
 *
 * - Source URL is resolved via Tauri's `convertFileSrc` (asset:// protocol)
 *   so local file paths play without copying. In browser preview the path
 *   is used verbatim; absolute paths won't actually play but the cursor
 *   logic still ticks via the placeholder element.
 * - Play/pause state, cursor position, and seek are wired bidirectionally
 *   through the Zustand store so any component can drive playback.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const meta = useApp((s) => s.meta);
  const isPlaying = useApp((s) => s.isPlaying);
  const setPlaying = useApp((s) => s.setPlaying);
  const cursorSecs = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);

  // Resolve the source URL whenever a new file is loaded.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!meta?.path) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    let url = meta.path;
    (async () => {
      try {
        const core = await import("@tauri-apps/api/core");
        url = core.convertFileSrc(meta.path);
      } catch {
        // browser preview: leave the raw path
      }
      audio.src = url;
      audio.load();
    })();
  }, [meta?.path]);

  // Mirror play/pause from store → element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !meta) return;
    if (isPlaying) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, meta, setPlaying]);

  // Mirror element events → store
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCursor(audio.currentTime);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [setCursor, setPlaying]);

  // External seek (e.g. clicking the canvas) → element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Math.abs(audio.currentTime - cursorSecs) > 0.05) {
      audio.currentTime = cursorSecs;
    }
  }, [cursorSecs]);

  return { audioRef };
}
