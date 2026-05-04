import { useEffect, useRef } from "react";
import { computeGainAtTime } from "../lib/fade";
import { useApp } from "../store/appStore";

/**
 * Owns the single `<audio>` element used for playback and routes its
 * output through a Web Audio GainNode so the timeline's fade-in /
 * fade-out is audible during preview, not just in exported files.
 *
 * - Source URL is resolved via Tauri's `convertFileSrc` (asset:// protocol)
 *   so local file paths play without copying. In browser preview the path
 *   is used verbatim; absolute paths won't actually play but the cursor
 *   logic still ticks via the placeholder element.
 * - Play / pause state, cursor position and seek are wired bidirectionally
 *   through the Zustand store so any component can drive playback.
 * - The gain envelope is rebuilt whenever fade values, duration, the
 *   active document or the playback head change in a non-trivial way.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const meta = useApp((s) => s.meta);
  const isPlaying = useApp((s) => s.isPlaying);
  const setPlaying = useApp((s) => s.setPlaying);
  const cursorSecs = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);
  const timeline = useApp((s) => s.timeline);
  // timelineRev bumps whenever clips mutate, so depending on it makes the
  // fade effect re-run after `applyTimelineFadeIn / Out`
  const timelineRev = useApp((s) => s.timelineRev);

  const fadeIn = timeline.timelineFadeIn;
  const fadeOut = timeline.timelineFadeOut;
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

  // ── Web Audio fade envelope ─────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function ensureGraph(): boolean {
      if (sourceRef.current && gainRef.current && ctxRef.current) return true;
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor || !audio) return false;
      try {
        const ctx = new Ctor();
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        source.connect(gain).connect(ctx.destination);
        ctxRef.current = ctx;
        sourceRef.current = source;
        gainRef.current = gain;
        return true;
      } catch (e) {
        console.warn("Audio graph init failed", e);
        return false;
      }
    }

    /**
     * Rebuild the future-facing portion of the gain envelope. We always
     * cancel previously scheduled values and then either
     *   (1) just pin the current gain (paused / scheduleFuture=false), or
     *   (2) schedule the remaining ramps from now → end-of-track.
     */
    function applyEnvelope(scheduleFuture: boolean) {
      const ctx = ctxRef.current;
      const gain = gainRef.current;
      if (!ctx || !gain || !audio) return;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      const t = audio.currentTime;
      const startGain = computeGainAtTime(t, totalDur, fadeIn, fadeOut);
      gain.gain.setValueAtTime(startGain, now);
      if (!scheduleFuture || totalDur <= 0) return;

      // Finish the fade-in if we're still inside it.
      if (fadeIn > 0 && t < fadeIn) {
        gain.gain.linearRampToValueAtTime(1, now + (fadeIn - t));
      }

      // Schedule the fade-out tail.
      if (fadeOut > 0) {
        const fadeOutStart = totalDur - fadeOut;
        if (fadeOutStart > t) {
          // hold full gain until the fade-out region begins
          gain.gain.setValueAtTime(1, now + (fadeOutStart - t));
          gain.gain.linearRampToValueAtTime(0, now + (totalDur - t));
        } else if (t < totalDur) {
          // already inside the fade-out region — ramp the rest
          gain.gain.linearRampToValueAtTime(0, now + (totalDur - t));
        }
      }
    }

    function onPlay() {
      if (!ensureGraph()) return;
      void ctxRef.current?.resume();
      applyEnvelope(true);
    }
    function onPause() {
      applyEnvelope(false);
    }
    function onSeeked() {
      if (audio) applyEnvelope(!audio.paused);
    }

    // Apply now in case fade values changed mid-state.
    if (audio && sourceRef.current) applyEnvelope(!audio.paused);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeked", onSeeked);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("seeked", onSeeked);
    };
  }, [fadeIn, fadeOut, totalDur, timelineRev]);

  // Close the audio context on unmount to free system audio resources.
  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
      sourceRef.current = null;
      gainRef.current = null;
    };
  }, []);

  return { audioRef };
}
