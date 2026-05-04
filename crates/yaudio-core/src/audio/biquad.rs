//! Direct-form-I biquad filter for the 3-band EQ pass.
//!
//! Coefficients follow the Audio EQ Cookbook (Robert Bristow-Johnson),
//! since that's the canonical reference for shelving / peaking biquads
//! used by every 3-band tone control we'd want to imitate.

use std::f32::consts::PI;

#[derive(Clone, Debug)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    /// Identity (passthrough): output equals input.
    pub fn identity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    /// Low-shelf: boosts or cuts everything below `freq` Hz by `gain_db`.
    pub fn low_shelf(freq_hz: f32, q: f32, gain_db: f32, sample_rate: u32) -> Self {
        let a = 10f32.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq_hz / sample_rate as f32;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.001));
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

        Self::normalized(b0, b1, b2, a0, a1, a2)
    }

    /// Peaking EQ: boosts or cuts a band centered on `freq` Hz by `gain_db`.
    pub fn peaking(freq_hz: f32, q: f32, gain_db: f32, sample_rate: u32) -> Self {
        let a = 10f32.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq_hz / sample_rate as f32;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.001));

        let a0 = 1.0 + alpha / a;
        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0 - alpha * a;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha / a;

        Self::normalized(b0, b1, b2, a0, a1, a2)
    }

    /// High-shelf: boosts or cuts everything above `freq` Hz by `gain_db`.
    pub fn high_shelf(freq_hz: f32, q: f32, gain_db: f32, sample_rate: u32) -> Self {
        let a = 10f32.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq_hz / sample_rate as f32;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.001));
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
        let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
        let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

        Self::normalized(b0, b1, b2, a0, a1, a2)
    }

    fn normalized(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    /// Process one sample through the filter (transposed direct form II).
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }

    pub fn process_buffer(&mut self, buf: &mut [f32]) {
        for s in buf.iter_mut() {
            *s = self.process(*s);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_passes_signal_through_unchanged() {
        let mut bq = Biquad::identity();
        let input = [0.1, -0.4, 0.7, -1.0, 0.2];
        for &s in &input {
            assert!((bq.process(s) - s).abs() < 1e-6);
        }
    }

    #[test]
    fn zero_gain_shelves_and_peaks_are_passthrough() {
        // gain_db = 0 should produce identity-equivalent filters
        let mut buf: Vec<f32> = (0..1000)
            .map(|i| (i as f32 * 0.05).sin() * 0.3)
            .collect();
        let original = buf.clone();
        let mut bq = Biquad::low_shelf(200.0, 0.7071, 0.0, 48_000);
        bq.process_buffer(&mut buf);
        for (a, b) in original.iter().zip(buf.iter()) {
            assert!((a - b).abs() < 1e-3, "low_shelf 0dB drift");
        }

        let mut buf: Vec<f32> = original.clone();
        let mut bq = Biquad::peaking(1_000.0, 0.7071, 0.0, 48_000);
        bq.process_buffer(&mut buf);
        for (a, b) in original.iter().zip(buf.iter()) {
            assert!((a - b).abs() < 1e-3, "peaking 0dB drift");
        }
    }

    #[test]
    fn low_shelf_boost_amplifies_dc() {
        // DC (constant signal) sits well below any cutoff, so a positive
        // low-shelf must boost it. After settling, output ≈ +6 dB ≈ ×2.
        let mut bq = Biquad::low_shelf(500.0, 0.7071, 6.0, 48_000);
        let mut last = 0.0f32;
        for _ in 0..2_000 {
            last = bq.process(0.5);
        }
        // expect ~1.0 (i.e. 0.5 × 2.0). Allow generous tolerance.
        assert!(last > 0.85 && last < 1.15, "got {last}");
    }

    #[test]
    fn high_shelf_boost_amplifies_nyquist_alternation() {
        // alternating ±1 at Nyquist frequency — far above any audio
        // cutoff, so a positive high-shelf must boost the alternation.
        let mut bq = Biquad::high_shelf(4_000.0, 0.7071, 6.0, 48_000);
        let mut peak = 0.0f32;
        for i in 0..2_000 {
            let s = if i % 2 == 0 { 0.5 } else { -0.5 };
            peak = peak.max(bq.process(s).abs());
        }
        assert!(peak > 0.8, "peak should ramp above 0.8, got {peak}");
    }

    #[test]
    fn cut_attenuates_below_unity() {
        let mut bq = Biquad::low_shelf(500.0, 0.7071, -12.0, 48_000);
        let mut last = 0.0f32;
        for _ in 0..2_000 {
            last = bq.process(0.5);
        }
        // -12 dB ≈ ×0.25 → about 0.125
        assert!(last.abs() < 0.2, "got {last}");
    }
}
