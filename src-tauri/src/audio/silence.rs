use crate::audio::decoder;
use crate::error::AudioResult;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SilenceRange {
    pub start_secs: f64,
    pub end_secs: f64,
}

/// Detect silence regions whose RMS amplitude drops below `threshold_db`
/// for at least `min_duration_ms` consecutive milliseconds.
///
/// Reuses the waveform envelope so detection cost stays bounded; for
/// production-grade trimming the editor will re-scan the original PCM.
pub fn detect(path: &str, threshold_db: f32, min_duration_ms: u32) -> AudioResult<Vec<SilenceRange>> {
    let envelope = decoder::extract_waveform(path, 4_096)?;
    let buckets = envelope.bucket_count;
    if buckets == 0 || envelope.meta.duration_secs <= 0.0 {
        return Ok(vec![]);
    }
    let secs_per_bucket = envelope.meta.duration_secs / buckets as f64;
    let min_buckets = ((min_duration_ms as f64 / 1000.0) / secs_per_bucket).ceil() as usize;
    let threshold = db_to_amp(threshold_db);

    let mut ranges = Vec::new();
    let mut run_start: Option<usize> = None;

    for i in 0..buckets {
        let min = envelope.peaks[i * 2].abs();
        let max = envelope.peaks[i * 2 + 1].abs();
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

    Ok(ranges)
}

fn db_to_amp(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}
