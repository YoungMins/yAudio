import { useEffect, useRef } from "react";
import { dbToLinear } from "../lib/audioMath";
import { computeGainAtTime } from "../lib/fade";
import { useApp } from "../store/appStore";

/**
 * Web-Audio-driven preview engine.
 *
 * The previous incarnation routed an `<audio>` element through
 * MediaElementAudioSourceNode → GainNode, but Tauri's `asset://` URLs
 * combined with WebView2's cross-origin handling made that node graph
 * silent. We sidestep the problem by fetching the file as bytes,
 * decoding to an AudioBuffer, and playing through an AudioBufferSource.
 * This also unlocks live EQ and full-range volume (no audio.volume clamp).
 *
 * Graph: AudioBufferSourceNode → eqLow → eqMid → eqHigh → fadeGain → trackGain → destination
 *
 * Manual cursor tracking: AudioBufferSourceNode has no `currentTime`,
 * so we record `ctx.currentTime` at start and accumulate the offset.
 */
interface AudioGraph {
  ctx: AudioContext;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  fadeGain: GainNode;
  trackGain: GainNode;
}

function createGraph(): AudioGraph | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 200;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 4000;

    const fadeGain = ctx.createGain();
    const trackGain = ctx.createGain();

    eqLow
      .connect(eqMid)
      .connect(eqHigh)
      .connect(fadeGain)
      .connect(trackGain)
      .connect(ctx.destination);

    return { ctx, eqLow, eqMid, eqHigh, fadeGain, trackGain };
  } catch (e) {
    console.error("Audio graph init failed", e);
    return null;
  }
}

export function useAudioPlayer() {
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
  const eq = timeline.timelineEq;

  const graphRef = useRef<AudioGraph | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtCtxTimeRef = useRef(0);
  const pausedAtBufferTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const loadingPathRef = useRef<string | null>(null);

  function ensureGraph(): AudioGraph | null {
    if (!graphRef.current) graphRef.current = createGraph();
    return graphRef.current;
  }

  function currentPlayhead(): number {
    const g = graphRef.current;
    if (!g) return pausedAtBufferTimeRef.current;
    if (sourceRef.current) {
      return (
        pausedAtBufferTimeRef.current +
        (g.ctx.currentTime - startedAtCtxTimeRef.current)
      );
    }
    return pausedAtBufferTimeRef.current;
  }

  function applyFadeEnvelope(g: AudioGraph, scheduleFuture: boolean) {
    const now = g.ctx.currentTime;
    const t = currentPlayhead();
    const totalDur = bufferRef.current?.duration ?? 0;
    const param = g.fadeGain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(computeGainAtTime(t, totalDur, fadeIn, fadeOut), now);
    if (!scheduleFuture || totalDur <= 0) return;
    if (fadeIn > 0 && t < fadeIn) {
      param.linearRampToValueAtTime(1, now + (fadeIn - t));
    }
    if (fadeOut > 0) {
      const fadeOutStart = totalDur - fadeOut;
      if (fadeOutStart > t) {
        param.setValueAtTime(1, now + (fadeOutStart - t));
        param.linearRampToValueAtTime(0, now + (totalDur - t));
      } else if (t < totalDur) {
        param.linearRampToValueAtTime(0, now + (totalDur - t));
      }
    }
  }

  function startSource(g: AudioGraph, fromTime: number) {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const source = g.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(g.eqLow);
    source.onended = () => {
      // Only react to natural end. User-driven stop already nulled sourceRef.
      if (sourceRef.current === source) {
        sourceRef.current = null;
        pausedAtBufferTimeRef.current = buffer.duration;
        setPlaying(false);
      }
    };
    source.start(0, Math.max(0, Math.min(buffer.duration, fromTime)));
    sourceRef.current = source;
    startedAtCtxTimeRef.current = g.ctx.currentTime;
    pausedAtBufferTimeRef.current = fromTime;
  }

  function stopSource() {
    const source = sourceRef.current;
    if (!source) return;
    pausedAtBufferTimeRef.current = currentPlayhead();
    sourceRef.current = null;
    try {
      source.stop();
    } catch {
      /* ignore: stop on already-ended source throws */
    }
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
  }

  function startRaf() {
    if (rafRef.current !== null) return;
    const tick = () => {
      const t = currentPlayhead();
      const totalDur = bufferRef.current?.duration ?? 0;
      if (!sourceRef.current) {
        rafRef.current = null;
        return;
      }
      if (totalDur > 0 && t >= totalDur) {
        rafRef.current = null;
        return;
      }
      setCursor(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  function stopRaf() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  // Decode the buffer whenever the active source path changes
  useEffect(() => {
    let cancelled = false;
    stopSource();
    stopRaf();
    pausedAtBufferTimeRef.current = 0;

    if (!meta?.path) {
      bufferRef.current = null;
      loadingPathRef.current = null;
      return;
    }
    if (loadingPathRef.current === meta.path && bufferRef.current) return;
    loadingPathRef.current = meta.path;

    (async () => {
      const graph = ensureGraph();
      if (!graph) return;
      try {
        let url = meta.path;
        try {
          const core = await import("@tauri-apps/api/core");
          url = core.convertFileSrc(meta.path);
        } catch {
          /* browser preview: leave the raw path (likely 404, but won't crash) */
        }
        const resp = await fetch(url);
        const arrayBuffer = await resp.arrayBuffer();
        const decoded = await graph.ctx.decodeAudioData(arrayBuffer);
        if (cancelled) return;
        bufferRef.current = decoded;

        // If the user already pressed play while we were loading, start now
        if (useApp.getState().isPlaying) {
          await graph.ctx.resume();
          startSource(graph, 0);
          applyFadeEnvelope(graph, true);
          startRaf();
        }
      } catch (e) {
        console.error("Audio decode failed", e);
        bufferRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.path]);

  // Play / pause sync
  useEffect(() => {
    const graph = ensureGraph();
    if (!graph) return;
    if (isPlaying) {
      void graph.ctx.resume();
      if (!bufferRef.current) return; // will start when buffer finishes loading
      if (sourceRef.current) return; // already playing
      startSource(graph, pausedAtBufferTimeRef.current);
      applyFadeEnvelope(graph, true);
      startRaf();
    } else {
      stopSource();
      stopRaf();
      applyFadeEnvelope(graph, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // External seek (e.g. clicking the canvas)
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (Math.abs(currentPlayhead() - cursorSecs) < 0.05) return;
    const wasPlaying = !!sourceRef.current;
    if (wasPlaying) {
      stopSource();
      pausedAtBufferTimeRef.current = cursorSecs;
      startSource(graph, cursorSecs);
      applyFadeEnvelope(graph, true);
    } else {
      pausedAtBufferTimeRef.current = cursorSecs;
      applyFadeEnvelope(graph, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorSecs]);

  // Update fade envelope whenever fade values mutate
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    applyFadeEnvelope(graph, !!sourceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fadeIn, fadeOut, timelineRev]);

  // Track gain (no clamp, full ±dB respected)
  useEffect(() => {
    const graph = graphRef.current;
    if (graph) {
      graph.trackGain.gain.setTargetAtTime(
        dbToLinear(trackGainDb),
        graph.ctx.currentTime,
        0.01
      );
    }
  }, [trackGainDb]);

  // EQ live updates
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    graph.eqLow.gain.setTargetAtTime(eq.low, now, 0.01);
    graph.eqMid.gain.setTargetAtTime(eq.mid, now, 0.01);
    graph.eqHigh.gain.setTargetAtTime(eq.high, now, 0.01);
  }, [eq.low, eq.mid, eq.high]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSource();
      stopRaf();
      void graphRef.current?.ctx.close();
      graphRef.current = null;
      bufferRef.current = null;
    };
  }, []);
}
