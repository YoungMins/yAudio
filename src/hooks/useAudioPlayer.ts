import { useEffect, useRef } from "react";
import { dbToLinear } from "../lib/audioMath";
import { computeGainAtTime } from "../lib/fade";
import { useApp } from "../store/appStore";

/**
 * Owns the single `<audio>` element used for playback.
 *
 * Earlier versions wrapped the element through MediaElementAudioSourceNode →
 * GainNode → destination so a Web Audio graph could schedule a gain
 * envelope in advance. WebView2's handling of Tauri's `asset://` protocol
 * with that node graph can result in silent output, so we use a simpler
 * model that's known to work everywhere: drive the element's own
 * `volume` property from a requestAnimationFrame loop. The clipping at 1.0
 * means boosts above 0 dB only apply at export; sub-zero gains and the
 * full fade envelope are heard live.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const meta = useApp((s) => s.meta);
  const isPlaying = useApp((s) => s.isPlaying);
  const setPlaying = useApp((s) => s.setPlaying);
  const cursorSecs = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);
  const timeline = useApp((s) => s.timeline);
  const timelineRev = useApp((s) => s.timelineRev);

  const fadeIn = timeline.timelineFadeIn;
  const fadeOut = timeline.timelineFadeOut;
  const trackGainDb = timeline.timelineGainDb;
  const totalDur = meta?.duration_secs ?? 0;

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

  // ── Live gain envelope via audio.volume ─────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function applyGainNow() {
      if (!audio) return;
      const t = audio.currentTime;
      const fade = computeGainAtTime(t, totalDur, fadeIn, fadeOut);
      const linear = fade * dbToLinear(trackGainDb);
      // audio.volume tops out at 1.0 — boosts above 0 dB apply only on export
      audio.volume = Math.max(0, Math.min(1, linear));
    }

    function tick() {
      applyGainNow();
      if (audio && !audio.paused) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    }

    function start() {
      if (rafRef.current === null) tick();
    }
    function stop() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      applyGainNow(); // pin gain at the paused position too
    }

    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("seeked", applyGainNow);
    // Apply once on mount/dependency change so paused tweaks are heard
    applyGainNow();
    if (!audio.paused) start();

    return () => {
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("seeked", applyGainNow);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fadeIn, fadeOut, totalDur, trackGainDb, timelineRev]);

  return { audioRef };
}
