import type { Clip } from "./timeline";
import { clipEnd } from "./timeline";

/**
 * Snap `time` to the start or end of any clip that's within `threshold`
 * seconds. Returns the snapped time, or the original time if nothing is
 * close enough. `skipId` (if set) excludes one clip — useful so a clip
 * being dragged doesn't snap to its own edges.
 */
export function snapToEdges(
  time: number,
  clips: readonly Clip[],
  threshold: number,
  skipId: number | null
): number {
  let best = time;
  let bestDist = threshold;
  for (const c of clips) {
    if (c.id === skipId) continue;
    for (const edge of [c.start, clipEnd(c)]) {
      const d = Math.abs(edge - time);
      if (d <= bestDist) {
        best = edge;
        bestDist = d;
      }
    }
  }
  return best;
}

export interface OverlapInfo {
  /** Id of the neighbor that overlaps the most. */
  with: number;
  /** Overlap length in seconds. */
  amount: number;
  /** Timeline coordinate where the two clips meet (mid-point of overlap). */
  midpoint: number;
}

/**
 * Find the strongest overlap between `moving` and any other clip in
 * `clips`. Returns `null` when there is no overlap. When multiple
 * neighbors overlap, the one with the largest overlap wins.
 */
export function findOverlap(
  moving: Clip,
  clips: readonly Clip[]
): OverlapInfo | null {
  let best: OverlapInfo | null = null;
  const ms = moving.start;
  const me = clipEnd(moving);
  for (const c of clips) {
    if (c.id === moving.id) continue;
    const cs = c.start;
    const ce = clipEnd(c);
    const lo = Math.max(ms, cs);
    const hi = Math.min(me, ce);
    if (hi <= lo) continue;
    const amount = hi - lo;
    if (!best || amount > best.amount) {
      best = { with: c.id, amount, midpoint: (lo + hi) / 2 };
    }
  }
  return best;
}
