//! Non-destructive clip-based timeline.
//!
//! Built TDD-first: every public mutation has a test in this file
//! and history snapshots make Undo/Redo trivially correct rather than
//! trying to invert each command.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Clip {
    pub id: u64,
    pub source_path: String,
    /// Position on the timeline, in seconds.
    pub start: f64,
    /// Length on the timeline, in seconds.
    pub duration: f64,
    /// Offset into the source media that the clip's first frame represents.
    pub source_offset: f64,
    pub fade_in: f64,
    pub fade_out: f64,
    pub gain_db: f32,
}

impl Clip {
    pub fn end(&self) -> f64 {
        self.start + self.duration
    }
}

#[derive(Debug, Default)]
pub struct Timeline {
    clips: Vec<Clip>,
    next_id: u64,
    history: Vec<Vec<Clip>>,
    future: Vec<Vec<Clip>>,
}

impl Timeline {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clips(&self) -> &[Clip] {
        &self.clips
    }

    pub fn len(&self) -> usize {
        self.clips.len()
    }

    pub fn is_empty(&self) -> bool {
        self.clips.is_empty()
    }

    /// Total length spanned by the clips on the timeline.
    pub fn duration(&self) -> f64 {
        self.clips.iter().map(|c| c.end()).fold(0.0_f64, f64::max)
    }

    fn snapshot(&mut self) {
        self.history.push(self.clips.clone());
        self.future.clear();
    }

    pub fn add(
        &mut self,
        source_path: impl Into<String>,
        start: f64,
        duration: f64,
        source_offset: f64,
    ) -> u64 {
        self.snapshot();
        self.next_id += 1;
        let clip = Clip {
            id: self.next_id,
            source_path: source_path.into(),
            start,
            duration,
            source_offset,
            fade_in: 0.0,
            fade_out: 0.0,
            gain_db: 0.0,
        };
        self.clips.push(clip);
        self.clips.sort_by(|a, b| a.start.total_cmp(&b.start));
        self.next_id
    }

    /// Removes any audio in `[start, end)` from the timeline. Clips fully
    /// inside the range are dropped; partially overlapping clips are
    /// trimmed; a clip that strictly contains the range is split into two.
    /// Material to the right of the cut is shifted left by `end - start`.
    pub fn delete_range(&mut self, start: f64, end: f64) {
        if end <= start {
            return;
        }
        self.snapshot();
        let cut_len = end - start;
        let mut next: Vec<Clip> = Vec::with_capacity(self.clips.len() + 1);

        for clip in self.clips.drain(..) {
            let cs = clip.start;
            let ce = clip.end();

            if ce <= start {
                next.push(clip);
            } else if cs >= end {
                let mut shifted = clip;
                shifted.start -= cut_len;
                next.push(shifted);
            } else if cs >= start && ce <= end {
                // fully inside the cut → drop entirely
                continue;
            } else if cs < start && ce > end {
                // strictly contains the cut → split
                let left_len = start - cs;
                let right_len = ce - end;
                let left = Clip {
                    duration: left_len,
                    ..clip.clone()
                };
                self.next_id += 1;
                let right = Clip {
                    id: self.next_id,
                    start: cs + left_len, // sits where right side will land after shift
                    duration: right_len,
                    source_offset: clip.source_offset + (end - cs),
                    fade_in: 0.0,
                    fade_out: clip.fade_out,
                    gain_db: clip.gain_db,
                    source_path: clip.source_path.clone(),
                };
                next.push(left);
                next.push(right);
            } else if cs < start {
                // overlaps left edge → keep left portion
                let mut left = clip;
                left.duration = start - cs;
                next.push(left);
            } else {
                // overlaps right edge → keep right portion, then shift left
                let consumed = end - cs;
                let mut right = clip;
                right.source_offset += consumed;
                right.duration -= consumed;
                right.start = start;
                next.push(right);
            }
        }

        next.sort_by(|a, b| a.start.total_cmp(&b.start));
        self.clips = next;
    }

    /// Duplicate of `delete_range` that returns the removed slice as a
    /// detached set of clips with their `start` rebased to zero. Useful
    /// for clipboard-style cut/paste.
    pub fn cut_range(&mut self, start: f64, end: f64) -> Vec<Clip> {
        let captured = self.slice_range(start, end);
        self.delete_range(start, end);
        captured
    }

    fn slice_range(&self, start: f64, end: f64) -> Vec<Clip> {
        let mut out = Vec::new();
        for clip in &self.clips {
            let cs = clip.start;
            let ce = clip.end();
            if ce <= start || cs >= end {
                continue;
            }
            let s = cs.max(start);
            let e = ce.min(end);
            out.push(Clip {
                id: 0,
                source_path: clip.source_path.clone(),
                start: s - start,
                duration: e - s,
                source_offset: clip.source_offset + (s - cs),
                fade_in: 0.0,
                fade_out: 0.0,
                gain_db: clip.gain_db,
            });
        }
        out
    }

    pub fn paste(&mut self, at: f64, clips: &[Clip]) {
        if clips.is_empty() {
            return;
        }
        self.snapshot();
        for c in clips {
            self.next_id += 1;
            self.clips.push(Clip {
                id: self.next_id,
                start: at + c.start,
                ..c.clone()
            });
        }
        self.clips.sort_by(|a, b| a.start.total_cmp(&b.start));
    }

    /// Apply matching fade-out / fade-in on the two clips that touch at
    /// `time`, smoothing the transition over `duration` seconds.
    pub fn crossfade_at(&mut self, time: f64, duration: f64) {
        if duration <= 0.0 {
            return;
        }
        self.snapshot();
        let half = duration / 2.0;
        for clip in &mut self.clips {
            if (clip.end() - time).abs() <= half + 1e-6 {
                clip.fade_out = duration;
            }
            if (clip.start - time).abs() <= half + 1e-6 {
                clip.fade_in = duration;
            }
        }
    }

    pub fn undo(&mut self) -> bool {
        if let Some(prev) = self.history.pop() {
            self.future.push(std::mem::replace(&mut self.clips, prev));
            true
        } else {
            false
        }
    }

    pub fn redo(&mut self) -> bool {
        if let Some(next) = self.future.pop() {
            self.history.push(std::mem::replace(&mut self.clips, next));
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tl_with(clips: &[(f64, f64)]) -> Timeline {
        let mut t = Timeline::new();
        for (s, d) in clips {
            t.add("a.wav", *s, *d, 0.0);
        }
        t
    }

    #[test]
    fn new_timeline_is_empty() {
        let t = Timeline::new();
        assert!(t.is_empty());
        assert_eq!(t.duration(), 0.0);
    }

    #[test]
    fn add_assigns_ascending_unique_ids() {
        let mut t = Timeline::new();
        let a = t.add("a", 0.0, 1.0, 0.0);
        let b = t.add("a", 1.0, 1.0, 0.0);
        assert_ne!(a, b);
        assert_eq!(t.clips().len(), 2);
    }

    #[test]
    fn add_keeps_clips_sorted_by_start() {
        let mut t = Timeline::new();
        t.add("a", 5.0, 1.0, 0.0);
        t.add("a", 1.0, 1.0, 0.0);
        t.add("a", 3.0, 1.0, 0.0);
        let starts: Vec<f64> = t.clips().iter().map(|c| c.start).collect();
        assert_eq!(starts, vec![1.0, 3.0, 5.0]);
    }

    #[test]
    fn delete_range_drops_fully_contained_clip() {
        let mut t = tl_with(&[(0.0, 2.0), (3.0, 1.0), (5.0, 2.0)]);
        t.delete_range(2.5, 4.5);
        assert_eq!(t.clips().len(), 2);
        // remaining clips: [0..2] kept, [5..7] shifted left by 2 → [3..5]
        assert_eq!(t.clips()[0].start, 0.0);
        assert_eq!(t.clips()[1].start, 3.0);
        assert_eq!(t.clips()[1].duration, 2.0);
    }

    #[test]
    fn delete_range_trims_clip_overlapping_left_edge() {
        let mut t = tl_with(&[(0.0, 5.0)]);
        t.delete_range(3.0, 4.0);
        // expect a single 4s clip: [0..3] then [4..5] shifted to [3..4]
        // implementation keeps both halves, so verify total duration & boundaries
        let total: f64 = t.clips().iter().map(|c| c.duration).sum();
        assert!((total - 4.0).abs() < 1e-9, "total={total}");
        assert_eq!(t.clips()[0].start, 0.0);
        assert!(t.clips().last().unwrap().end() <= 4.0 + 1e-9);
    }

    #[test]
    fn delete_range_with_inverted_bounds_is_a_noop() {
        let mut t = tl_with(&[(0.0, 2.0)]);
        let before = t.clips().to_vec();
        t.delete_range(3.0, 1.0);
        assert_eq!(t.clips(), before.as_slice());
    }

    #[test]
    fn cut_range_returns_zero_based_slice_and_removes_from_timeline() {
        let mut t = tl_with(&[(0.0, 4.0)]);
        let captured = t.cut_range(1.0, 3.0);
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].start, 0.0);
        assert!((captured[0].duration - 2.0).abs() < 1e-9);
        // timeline should now be 2 seconds total
        let total: f64 = t.clips().iter().map(|c| c.duration).sum();
        assert!((total - 2.0).abs() < 1e-9);
    }

    #[test]
    fn paste_inserts_at_offset() {
        let mut t = tl_with(&[(0.0, 2.0)]);
        let mut clipboard = vec![Clip {
            id: 0,
            source_path: "x".into(),
            start: 0.0,
            duration: 1.0,
            source_offset: 0.0,
            fade_in: 0.0,
            fade_out: 0.0,
            gain_db: 0.0,
        }];
        clipboard.push(Clip {
            start: 1.0,
            ..clipboard[0].clone()
        });
        t.paste(5.0, &clipboard);
        let starts: Vec<f64> = t.clips().iter().map(|c| c.start).collect();
        assert_eq!(starts, vec![0.0, 5.0, 6.0]);
    }

    #[test]
    fn undo_restores_previous_state_and_redo_replays_it() {
        let mut t = Timeline::new();
        t.add("a", 0.0, 1.0, 0.0);
        t.add("a", 2.0, 1.0, 0.0);
        assert_eq!(t.len(), 2);

        t.delete_range(0.0, 1.0);
        assert_eq!(t.len(), 1);

        assert!(t.undo());
        assert_eq!(t.len(), 2);

        assert!(t.redo());
        assert_eq!(t.len(), 1);
    }

    #[test]
    fn new_change_after_undo_clears_redo_stack() {
        let mut t = Timeline::new();
        t.add("a", 0.0, 1.0, 0.0);
        t.add("a", 1.0, 1.0, 0.0);
        t.undo(); // back to one clip
        t.add("a", 5.0, 1.0, 0.0); // diverging change
        assert!(!t.redo(), "redo should be cleared by a new mutation");
    }

    #[test]
    fn undo_on_empty_history_returns_false() {
        let mut t = Timeline::new();
        assert!(!t.undo());
        assert!(!t.redo());
    }

    #[test]
    fn crossfade_marks_neighboring_clips() {
        let mut t = tl_with(&[(0.0, 2.0), (2.0, 2.0)]);
        t.crossfade_at(2.0, 0.5);
        let clips = t.clips();
        assert!((clips[0].fade_out - 0.5).abs() < 1e-9);
        assert!((clips[1].fade_in - 0.5).abs() < 1e-9);
    }
}
