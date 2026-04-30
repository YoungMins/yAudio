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
}

export interface ClipSpec {
  sourcePath: string;
  start: number;
  duration: number;
  sourceOffset: number;
  fadeIn?: number;
  fadeOut?: number;
  gainDb?: number;
}

export const clipEnd = (c: Clip): number => c.start + c.duration;

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
