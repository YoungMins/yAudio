use crate::audio::decoder;
use crate::error::AudioResult;
use serde::Serialize;

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct SilenceRange {
    pub start_secs: f64,
    pub end_secs: f64,
}

/// Detect silence regions whose peak amplitude drops below `threshold_db`
/// for at least `min_duration_ms` consecutive milliseconds.
pub fn detect(
    path: &str,
    threshold_db: f32,
    min_duration_ms: u32,
) -> AudioResult<Vec<SilenceRange>> {
    let envelope = decoder::extract_waveform(path, 4_096)?;
    Ok(detect_in_envelope(
        &envelope.peaks,
        envelope.bucket_count,
        envelope.meta.duration_secs,
        threshold_db,
        min_duration_ms,
    ))
}

/// Pure detection over a min/max envelope. Split out from `detect` so the
/// algorithm is unit-testable without a real file on disk.
pub fn detect_in_envelope(
    peaks: &[f32],
    buckets: usize,
    duration_secs: f64,
    threshold_db: f32,
    min_duration_ms: u32,
) -> Vec<SilenceRange> {
    if buckets == 0 || duration_secs <= 0.0 || peaks.len() < buckets * 2 {
        return vec![];
    }
    let secs_per_bucket = duration_secs / buckets as f64;
    let min_buckets = ((min_duration_ms as f64 / 1000.0) / secs_per_bucket)
        .ceil()
        .max(1.0) as usize;
    let threshold = db_to_amp(threshold_db);

    let mut ranges = Vec::new();
    let mut run_start: Option<usize> = None;

    for i in 0..buckets {
        let min = peaks[i * 2].abs();
        let max = peaks[i * 2 + 1].abs();
        let peak = min.max(max);
        let is_silent = peak < threshold;

        match (is_silent, run_start) {
            (true, None) => run_start = Some(i),
            (false, Some(start)) => {
                if i - start >= min_buckets {
                    ranges.push(SilenceRange {
                        start_secs: start as f64 * secs_per_bucket,
                        end_secs: i as f64 * secs_per_bucket,
                    });
                }
                run_start = None;
            }
            _ => {}
        }
    }

    if let Some(start) = run_start {
        if buckets - start >= min_buckets {
            ranges.push(SilenceRange {
                start_secs: start as f64 * secs_per_bucket,
                end_secs: buckets as f64 * secs_per_bucket,
            });
        }
    }

    ranges
}

fn db_to_amp(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(amps: &[f32]) -> Vec<f32> {
        let mut peaks = Vec::with_capacity(amps.len() * 2);
        for &a in amps {
            peaks.push(-a);
            peaks.push(a);
        }
        peaks
    }

    #[test]
    fn empty_inputs_return_no_ranges() {
        assert!(detect_in_envelope(&[], 0, 1.0, -40.0, 100).is_empty());
        assert!(detect_in_envelope(&envelope(&[0.5; 4]), 4, 0.0, -40.0, 100).is_empty());
    }

    #[test]
    fn fully_silent_buffer_yields_one_range() {
        let buckets = 10;
        let peaks = envelope(&vec![0.0; buckets]);
        let r = detect_in_envelope(&peaks, buckets, 1.0, -40.0, 50);
        assert_eq!(r.len(), 1);
        assert!((r[0].start_secs - 0.0).abs() < 1e-9);
        assert!((r[0].end_secs - 1.0).abs() < 1e-9);
    }

    #[test]
    fn loud_buffer_yields_no_ranges() {
        let buckets = 10;
        let peaks = envelope(&vec![0.9; buckets]);
        let r = detect_in_envelope(&peaks, buckets, 1.0, -40.0, 50);
        assert!(r.is_empty());
    }

    #[test]
    fn run_below_min_duration_is_ignored() {
        // 1 silent bucket out of 10 = 100ms, min=200ms must reject it
        let mut amps = vec![0.5f32; 10];
        amps[5] = 0.0;
        let peaks = envelope(&amps);
        let r = detect_in_envelope(&peaks, 10, 1.0, -40.0, 200);
        assert!(r.is_empty());
    }

    #[test]
    fn detects_middle_silence_with_correct_bounds() {
        // 10 buckets over 1.0s: [loud, loud, loud, sil, sil, sil, sil, loud, loud, loud]
        let amps: Vec<f32> = (0..10)
            .map(|i| if (3..7).contains(&i) { 0.0 } else { 0.5 })
            .collect();
        let peaks = envelope(&amps);
        let r = detect_in_envelope(&peaks, 10, 1.0, -40.0, 100);
        assert_eq!(r.len(), 1);
        assert!((r[0].start_secs - 0.3).abs() < 1e-9);
        assert!((r[0].end_secs - 0.7).abs() < 1e-9);
    }

    #[test]
    fn threshold_db_controls_sensitivity() {
        // 0.05 amp ≈ -26 dB, so threshold -30 should treat it as silence,
        // threshold -40 should NOT.
        let amps = vec![0.05f32; 10];
        let peaks = envelope(&amps);
        let strict = detect_in_envelope(&peaks, 10, 1.0, -40.0, 100);
        let loose = detect_in_envelope(&peaks, 10, 1.0, -20.0, 100);
        assert!(strict.is_empty());
        assert_eq!(loose.len(), 1);
    }
}
