/**
 * Non-destructive clip-based timeline — TypeScript mirror of
 * `yaudio_core::audio::editor::Timeline`.
 *
 * Lives in the frontend so the UI can mutate clips at 60fps without an IPC
 * round-trip. The Rust version remains the source of truth for export /
 * render passes (which can compare the resulting clip arrays).
 */
export interface Clip {
  id: number;
  sourcePath: string;
  start: number;
  duration: number;
  sourceOffset: number;
  fadeIn: number;
  fadeOut: number;
  gainDb: number;
  eqLowDb: number;
  eqMidDb: number;
  eqHighDb: number;
}

export interface ClipSpec {
  sourcePath: string;
  start: number;
  duration: number;
  sourceOffset: number;
  fadeIn?: number;
  fadeOut?: number;
  gainDb?: number;
  eqLowDb?: number;
  eqMidDb?: number;
  eqHighDb?: number;
}

export const clipEnd = (c: Clip): number => c.start + c.duration;

/** Convert a frontend Clip into the snake_case shape Rust expects. */
export function toExportClip(c: Clip) {
  return {
    id: c.id,
    source_path: c.sourcePath,
    start: c.start,
    duration: c.duration,
    source_offset: c.sourceOffset,
    fade_in: c.fadeIn,
    fade_out: c.fadeOut,
    gain_db: c.gainDb,
    eq_low_db: c.eqLowDb,
    eq_mid_db: c.eqMidDb,
    eq_high_db: c.eqHighDb,
  };
}

export class Timeline {
  private _clips: Clip[] = [];
  private nextId = 0;
  private history: Clip[][] = [];
  private future: Clip[][] = [];

  get clips(): readonly Clip[] {
    return this._clips;
  }

  get duration(): number {
    return this._clips.reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  private snapshot(): void {
    this.history.push(this._clips.map((c) => ({ ...c })));
    this.future = [];
  }

  private sort(): void {
    this._clips.sort((a, b) => a.start - b.start);
  }

  add(spec: ClipSpec): number {
    this.snapshot();
    this.nextId += 1;
    const clip: Clip = {
      id: this.nextId,
      sourcePath: spec.sourcePath,
      start: spec.start,
      duration: spec.duration,
      sourceOffset: spec.sourceOffset,
      fadeIn: spec.fadeIn ?? 0,
      fadeOut: spec.fadeOut ?? 0,
      gainDb: spec.gainDb ?? 0,
      eqLowDb: spec.eqLowDb ?? 0,
      eqMidDb: spec.eqMidDb ?? 0,
      eqHighDb: spec.eqHighDb ?? 0,
    };
    this._clips.push(clip);
    this.sort();
    return clip.id;
  }

  /**
   * Removes audio in `[start, end)`. Material to the right of the cut is
   * shifted left by `end - start`. Mirrors the Rust implementation's
   * branching exactly so the export pipeline stays consistent.
   */
  deleteRange(start: number, end: number): void {
    if (end <= start) return;
    this.snapshot();
    const cutLen = end - start;
    const next: Clip[] = [];

    for (const clip of this._clips) {
      const cs = clip.start;
      const ce = clipEnd(clip);

      if (ce <= start) {
        next.push(clip);
      } else if (cs >= end) {
        next.push({ ...clip, start: clip.start - cutLen });
      } else if (cs >= start && ce <= end) {
        // fully inside the cut → drop
      } else if (cs < start && ce > end) {
        // strictly contains the cut → split
        const leftLen = start - cs;
        const rightLen = ce - end;
        next.push({ ...clip, duration: leftLen });
        this.nextId += 1;
        next.push({
          ...clip,
          id: this.nextId,
          start: cs + leftLen,
          duration: rightLen,
          sourceOffset: clip.sourceOffset + (end - cs),
          fadeIn: 0,
        });
      } else if (cs < start) {
        next.push({ ...clip, duration: start - cs });
      } else {
        const consumed = end - cs;
        next.push({
          ...clip,
          start,
          sourceOffset: clip.sourceOffset + consumed,
          duration: clip.duration - consumed,
        });
      }
    }

    this._clips = next;
    this.sort();
  }

  /**
   * Removes the slice and returns a detached copy with `start` rebased
   * to zero, suitable for clipboard-style paste.
   */
  cutRange(start: number, end: number): Clip[] {
    const captured = this.sliceRange(start, end);
    this.deleteRange(start, end);
    return captured;
  }

  private sliceRange(start: number, end: number): Clip[] {
    const out: Clip[] = [];
    for (const clip of this._clips) {
      const cs = clip.start;
      const ce = clipEnd(clip);
      if (ce <= start || cs >= end) continue;
      const s = Math.max(cs, start);
      const e = Math.min(ce, end);
      out.push({
        id: 0,
        sourcePath: clip.sourcePath,
        start: s - start,
        duration: e - s,
        sourceOffset: clip.sourceOffset + (s - cs),
        fadeIn: 0,
        fadeOut: 0,
        gainDb: clip.gainDb,
        eqLowDb: clip.eqLowDb,
        eqMidDb: clip.eqMidDb,
        eqHighDb: clip.eqHighDb,
      });
    }
    return out;
  }

  paste(at: number, clips: Clip[]): void {
    if (clips.length === 0) return;
    this.snapshot();
    for (const c of clips) {
      this.nextId += 1;
      this._clips.push({ ...c, id: this.nextId, start: at + c.start });
    }
    this.sort();
  }

  /**
   * Apply a fade-out on the clip ending at `time` and a fade-in on the clip
   * starting at `time`, both lasting `duration` seconds.
   */
  crossfadeAt(time: number, duration: number): void {
    if (duration <= 0) return;
    this.snapshot();
    const half = duration / 2;
    const eps = 1e-6;
    this._clips = this._clips.map((c) => {
      const next = { ...c };
      if (Math.abs(clipEnd(c) - time) <= half + eps) next.fadeOut = duration;
      if (Math.abs(c.start - time) <= half + eps) next.fadeIn = duration;
      return next;
    });
  }

  find(id: number): Clip | undefined {
    return this._clips.find((c) => c.id === id);
  }

  trimStart(id: number, newStart: number): boolean {
    const idx = this._clips.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const clip = this._clips[idx];
    const delta = newStart - clip.start;
    const bounded = Math.max(delta, -clip.sourceOffset);
    if (clip.duration - bounded <= 0) return false;
    if (Math.abs(bounded) < 1e-9) return false;
    this.snapshot();
    const c = this._clips[idx];
    c.start += bounded;
    c.duration -= bounded;
    c.sourceOffset += bounded;
    this.sort();
    return true;
  }

  trimEnd(id: number, newEnd: number): boolean {
    const idx = this._clips.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const start = this._clips[idx].start;
    if (newEnd <= start) return false;
    if (Math.abs(this._clips[idx].duration - (newEnd - start)) < 1e-9) return false;
    this.snapshot();
    this._clips[idx].duration = newEnd - start;
    return true;
  }

  moveClip(id: number, newStart: number): boolean {
    const idx = this._clips.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    if (newStart < 0) return false;
    if (Math.abs(this._clips[idx].start - newStart) < 1e-9) return false;
    this.snapshot();
    this._clips[idx].start = newStart;
    this.sort();
    return true;
  }

  setFadeIn(id: number, secs: number): boolean {
    const idx = this._clips.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const clamped = Math.max(0, Math.min(this._clips[idx].duration, secs));
    if (Math.abs(this._clips[idx].fadeIn - clamped) < 1e-9) return false;
    this.snapshot();
    this._clips[idx].fadeIn = clamped;
    return true;
  }

  setFadeOut(id: number, secs: number): boolean {
    const idx = this._clips.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const clamped = Math.max(0, Math.min(this._clips[idx].duration, secs));
    if (Math.abs(this._clips[idx].fadeOut - clamped) < 1e-9) return false;
    this.snapshot();
    this._clips[idx].fadeOut = clamped;
    return true;
  }

  /**
   * Apply a fade-in across the whole timeline by setting it on the
   * chronologically-first clip. Mirrors `setFadeIn` semantics (clamps
   * to clip duration, snapshots for undo).
   */
  applyTimelineFadeIn(secs: number): boolean {
    const first = this._clips[0]; // _clips is kept sorted by start
    return first ? this.setFadeIn(first.id, secs) : false;
  }

  /**
   * Apply a fade-out across the whole timeline by setting it on the
   * chronologically-last clip.
   */
  applyTimelineFadeOut(secs: number): boolean {
    const last = this._clips[this._clips.length - 1];
    return last ? this.setFadeOut(last.id, secs) : false;
  }

  /**
   * Apply the same gain (dB) to every clip. Used as a track-wide
   * "Volume" control — set to 0 dB to leave audio at its native level,
   * negative attenuates, positive boosts (boost above 0 dB only matters
   * at export time because audio.volume tops out at 1.0).
   */
  applyTimelineGainDb(db: number): boolean {
    if (this._clips.length === 0) return false;
    const same = this._clips.every((c) => Math.abs(c.gainDb - db) < 1e-9);
    if (same) return false;
    this.snapshot();
    for (const c of this._clips) c.gainDb = db;
    return true;
  }

  /** Current track-wide gain (reads the first clip; 0 dB on empty). */
  get timelineGainDb(): number {
    return this._clips[0]?.gainDb ?? 0;
  }

  /**
   * Apply track-wide 3-band EQ. Stored on every clip uniformly so a
   * future per-clip UI is just a flag away. Setting all three to 0
   * skips biquad processing at render time.
   */
  applyTimelineEq(lowDb: number, midDb: number, highDb: number): boolean {
    if (this._clips.length === 0) return false;
    const same = this._clips.every(
      (c) =>
        Math.abs(c.eqLowDb - lowDb) < 1e-6 &&
        Math.abs(c.eqMidDb - midDb) < 1e-6 &&
        Math.abs(c.eqHighDb - highDb) < 1e-6
    );
    if (same) return false;
    this.snapshot();
    for (const c of this._clips) {
      c.eqLowDb = lowDb;
      c.eqMidDb = midDb;
      c.eqHighDb = highDb;
    }
    return true;
  }

  /** Current EQ band gains, or all zeros when empty. */
  get timelineEq(): { low: number; mid: number; high: number } {
    const c = this._clips[0];
    if (!c) return { low: 0, mid: 0, high: 0 };
    return { low: c.eqLowDb, mid: c.eqMidDb, high: c.eqHighDb };
  }

  /** Current fade-in on the first clip, or 0 when the timeline is empty. */
  get timelineFadeIn(): number {
    return this._clips[0]?.fadeIn ?? 0;
  }

  /** Current fade-out on the last clip, or 0 when empty. */
  get timelineFadeOut(): number {
    return this._clips[this._clips.length - 1]?.fadeOut ?? 0;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.future.push(this._clips);
    this._clips = prev;
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.history.push(this._clips);
    this._clips = next;
    return true;
  }

  reset(): void {
    this._clips = [];
    this.history = [];
    this.future = [];
    this.nextId = 0;
  }
}
