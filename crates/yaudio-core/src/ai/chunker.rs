//! Frame-level helpers used by the AI inference layer.

/// Number of overlapping windows of size `frame_size` (with `hop`
/// stride) needed to fully cover a buffer of `n` samples. Used to
/// pre-allocate buffers before inference.
pub fn frame_count(n: usize, frame_size: usize, hop: usize) -> usize {
    if n == 0 || frame_size == 0 || hop == 0 {
        return 0;
    }
    if n <= frame_size {
        return 1;
    }
    1 + (n - frame_size).div_ceil(hop)
}

/// Apply a Hann window in place. RNNoise expects framed input weighted
/// with this window before short-time Fourier analysis.
pub fn hann_window(buf: &mut [f32]) {
    let n = buf.len();
    if n < 2 {
        return;
    }
    for (i, s) in buf.iter_mut().enumerate() {
        let w = 0.5
            - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (n as f32 - 1.0)).cos();
        *s *= w;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_count_returns_zero_for_empty_inputs() {
        assert_eq!(frame_count(0, 480, 240), 0);
        assert_eq!(frame_count(100, 0, 240), 0);
        assert_eq!(frame_count(100, 480, 0), 0);
    }

    #[test]
    fn small_buffer_yields_a_single_padded_frame() {
        assert_eq!(frame_count(100, 480, 480), 1);
    }

    #[test]
    fn non_overlapping_frames_count_correctly() {
        assert_eq!(frame_count(960, 480, 480), 2);
        assert_eq!(frame_count(961, 480, 480), 3);
    }

    #[test]
    fn overlapping_frames_count_with_hop_smaller_than_frame() {
        // 480-sample frames, 240-sample hop, 1440 samples
        // covers samples [0..480), [240..720), [480..960), ... etc
        assert_eq!(frame_count(1440, 480, 240), 5);
    }

    #[test]
    fn hann_window_starts_and_ends_at_zero() {
        let mut buf = vec![1.0f32; 8];
        hann_window(&mut buf);
        assert!((buf[0] - 0.0).abs() < 1e-6);
        assert!((buf[7] - 0.0).abs() < 1e-6);
        // peaks roughly in the middle
        assert!(buf[3] > 0.9 && buf[4] > 0.9);
    }

    #[test]
    fn hann_window_handles_degenerate_lengths() {
        let mut empty: Vec<f32> = vec![];
        hann_window(&mut empty);
        let mut single = vec![3.0f32];
        hann_window(&mut single);
        assert_eq!(single, vec![3.0]);
    }
}
