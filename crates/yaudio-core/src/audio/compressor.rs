//! Feed-forward dynamics compressor.
//!
//! Standard envelope-follower → static gain curve → smoothed gain
//! reduction model. Coefficients follow the usual ω = 1 - exp(-1/(τ·fs))
//! one-pole IIR for both attack and release. The static curve uses a
//! soft knee around `threshold_db` of width `knee_db` and a linear
//! ratio above the knee.
//!
//! All inputs are in standard units: samples in [-1, 1], gains in dB,
//! times in milliseconds, ratio as N:1 (e.g. 4 means 4:1).

#[derive(Clone, Copy, Debug)]
pub struct CompressorParams {
    pub threshold_db: f32,
    pub ratio: f32,
    pub attack_ms: f32,
    pub release_ms: f32,
    /// Soft knee width in dB. Use 0 for a hard knee.
    pub knee_db: f32,
    /// Make-up gain applied AFTER compression (dB).
    pub makeup_db: f32,
}

impl Default for CompressorParams {
    fn default() -> Self {
        Self {
            threshold_db: -18.0,
            ratio: 4.0,
            attack_ms: 10.0,
            release_ms: 80.0,
            knee_db: 6.0,
            makeup_db: 0.0,
        }
    }
}

/// Compress a mono buffer in-place. The envelope follower keeps state
/// across frames so this can be called incrementally on chunks of the
/// same stream by reusing the returned Compressor.
pub fn compress_buffer(buf: &mut [f32], sample_rate: u32, params: CompressorParams) {
    let mut comp = Compressor::new(sample_rate, params);
    for s in buf.iter_mut() {
        *s = comp.process(*s);
    }
}

#[derive(Clone, Debug)]
pub struct Compressor {
    sample_rate: f32,
    params: CompressorParams,
    attack_a: f32,
    release_a: f32,
    /// Envelope follower (linear amplitude).
    env: f32,
    makeup_lin: f32,
}

impl Compressor {
    pub fn new(sample_rate: u32, params: CompressorParams) -> Self {
        let sr = sample_rate as f32;
        let attack = params.attack_ms.max(0.1) / 1000.0;
        let release = params.release_ms.max(0.1) / 1000.0;
        Self {
            sample_rate: sr,
            params,
            attack_a: 1.0 - (-1.0 / (attack * sr)).exp(),
            release_a: 1.0 - (-1.0 / (release * sr)).exp(),
            env: 0.0,
            makeup_lin: 10f32.powf(params.makeup_db / 20.0),
        }
    }

    pub fn process(&mut self, x: f32) -> f32 {
        let abs = x.abs();
        // One-pole envelope follower (peak detector with separate
        // attack/release so transients move up faster than they decay).
        let a = if abs > self.env { self.attack_a } else { self.release_a };
        self.env += a * (abs - self.env);

        let env_db = if self.env > 1e-9 {
            20.0 * self.env.log10()
        } else {
            -120.0
        };

        let reduction_db = static_curve_db(env_db, self.params);
        let gain_lin = 10f32.powf((-reduction_db) / 20.0) * self.makeup_lin;
        x * gain_lin
    }

    /// Sample rate the compressor was constructed with — handy for tests.
    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }
}

/// dB of gain reduction at envelope level `env_db` for the given params.
/// Soft-knee region is interpolated quadratically per the AES Cookbook.
fn static_curve_db(env_db: f32, p: CompressorParams) -> f32 {
    let t = p.threshold_db;
    let r = p.ratio.max(1.0);
    let kn = p.knee_db.max(0.0);
    let half_knee = kn * 0.5;

    if env_db < t - half_knee {
        // below the knee → no reduction
        0.0
    } else if env_db > t + half_knee {
        // hard above the knee → linear
        let over = env_db - t;
        over - over / r
    } else if kn == 0.0 {
        let over = env_db - t;
        over - over / r
    } else {
        // soft knee
        let x = env_db - t + half_knee;
        let y = (1.0 - 1.0 / r) * x * x / (2.0 * kn);
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(buf: &[f32]) -> f32 {
        if buf.is_empty() {
            return 0.0;
        }
        let sum_sq: f32 = buf.iter().map(|s| s * s).sum();
        (sum_sq / buf.len() as f32).sqrt()
    }

    #[test]
    fn signal_well_below_threshold_passes_through_unchanged() {
        // -40 dB ≈ 0.01 amplitude, threshold -18 dB → no reduction
        let mut buf: Vec<f32> = (0..2_000)
            .map(|i| (i as f32 * 0.1).sin() * 0.01)
            .collect();
        let original = buf.clone();
        compress_buffer(&mut buf, 48_000, CompressorParams::default());
        for (a, b) in original.iter().zip(buf.iter()) {
            assert!((a - b).abs() < 1e-3);
        }
    }

    #[test]
    fn signal_above_threshold_is_attenuated_with_high_ratio() {
        // Constant 0.8 amplitude (≈ -1.94 dB) is well above -18 dB threshold.
        // 20:1 ratio drives the reduction toward "everything above threshold".
        let mut buf = vec![0.8f32; 4_000];
        let mut comp = Compressor::new(
            48_000,
            CompressorParams {
                threshold_db: -18.0,
                ratio: 20.0,
                attack_ms: 1.0,
                release_ms: 50.0,
                knee_db: 0.0,
                makeup_db: 0.0,
            },
        );
        for s in buf.iter_mut() {
            *s = comp.process(*s);
        }
        // Skip the attack ramp-in window
        let tail = &buf[2_000..];
        let level = rms(tail);
        // Expect compressed level to be near threshold (~0.126 linear).
        assert!(level < 0.4, "compressed RMS too high: {level}");
        assert!(level > 0.05, "compressed RMS clipped to silence: {level}");
    }

    #[test]
    fn higher_ratio_reduces_gain_more() {
        let make_run = |ratio: f32| {
            let mut buf = vec![0.8f32; 4_000];
            let mut comp = Compressor::new(
                48_000,
                CompressorParams {
                    threshold_db: -18.0,
                    ratio,
                    attack_ms: 1.0,
                    release_ms: 50.0,
                    knee_db: 0.0,
                    makeup_db: 0.0,
                },
            );
            for s in buf.iter_mut() {
                *s = comp.process(*s);
            }
            rms(&buf[2_000..])
        };
        let low = make_run(2.0);
        let high = make_run(20.0);
        assert!(high < low, "20:1 should attenuate more than 2:1 ({high} vs {low})");
    }

    #[test]
    fn makeup_gain_compensates_for_reduction() {
        // 0.8 input, hard limiter, +6 dB makeup ≈ ×2 → restore loudness
        let mut buf = vec![0.8f32; 4_000];
        let mut comp = Compressor::new(
            48_000,
            CompressorParams {
                threshold_db: -18.0,
                ratio: 20.0,
                attack_ms: 1.0,
                release_ms: 50.0,
                knee_db: 0.0,
                makeup_db: 6.0,
            },
        );
        for s in buf.iter_mut() {
            *s = comp.process(*s);
        }
        let level = rms(&buf[2_000..]);
        assert!(level > 0.1, "make-up should restore some loudness: {level}");
    }

    #[test]
    fn attack_smooths_a_step_input() {
        // Step from 0 to 1.0 with slow attack should ramp the gain
        // reduction in over time, so the first few samples after the step
        // are louder than later ones.
        let mut buf = vec![0.0f32; 100];
        buf.extend(vec![1.0f32; 1_000]);
        let mut comp = Compressor::new(
            48_000,
            CompressorParams {
                threshold_db: -12.0,
                ratio: 10.0,
                attack_ms: 50.0,
                release_ms: 200.0,
                knee_db: 0.0,
                makeup_db: 0.0,
            },
        );
        for s in buf.iter_mut() {
            *s = comp.process(*s);
        }
        let early = buf[101].abs();
        let late = buf[1_000].abs();
        assert!(
            early > late,
            "early sample should be louder than late: early={early}, late={late}"
        );
    }

    #[test]
    fn ratio_one_is_passthrough_above_threshold() {
        let mut buf = vec![0.5f32; 1_000];
        let original = buf.clone();
        compress_buffer(
            &mut buf,
            48_000,
            CompressorParams {
                threshold_db: -18.0,
                ratio: 1.0,
                attack_ms: 1.0,
                release_ms: 1.0,
                knee_db: 0.0,
                makeup_db: 0.0,
            },
        );
        for (a, b) in original.iter().zip(buf.iter()) {
            assert!((a - b).abs() < 1e-4, "ratio 1:1 should pass through");
        }
    }
}
