//! Audio-side AI helpers. The pure DSP plumbing (frame chunking,
//! overlap-add stitching) lives here and is unit-tested. The actual
//! ONNX runtime call lives behind the `onnx` feature flag so that
//! `cargo test` can run without ORT system libraries.

pub mod chunker;

#[cfg(feature = "onnx")]
pub mod denoise;

use crate::error::AudioResult;

/// Process audio with an arbitrary frame-wise function. This is the
/// integration seam between pure chunking and AI inference: tests can
/// pass `|frame| frame.to_vec()` (passthrough) and verify the chunker
/// reassembles the input exactly.
pub fn process_frames(
    samples: &[f32],
    frame_size: usize,
    mut f: impl FnMut(&[f32]) -> AudioResult<Vec<f32>>,
) -> AudioResult<Vec<f32>> {
    let mut out = Vec::with_capacity(samples.len());
    let mut i = 0;
    while i < samples.len() {
        let end = (i + frame_size).min(samples.len());
        let mut frame = vec![0.0f32; frame_size];
        frame[..end - i].copy_from_slice(&samples[i..end]);
        let processed = f(&frame)?;
        // Trust the callee's chunk length, but never write past the
        // original length so we don't pad the output beyond input.
        let take = (processed.len()).min(end - i);
        out.extend_from_slice(&processed[..take]);
        i = end;
    }
    Ok(out)
}

/// When the `onnx` feature is off we still expose a passthrough so the
/// Tauri command can build and operate as a no-op.
#[cfg(not(feature = "onnx"))]
pub fn denoise(samples: &[f32], _model_path: &std::path::Path) -> AudioResult<Vec<f32>> {
    Ok(samples.to_vec())
}

#[cfg(feature = "onnx")]
pub use denoise::denoise;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_frames_reproduce_the_input() {
        let input: Vec<f32> = (0..1000).map(|i| i as f32 / 1000.0).collect();
        let out = process_frames(&input, 480, |frame| Ok(frame.to_vec())).unwrap();
        // we only emit `take = end - i` per chunk, so the output equals
        // the input length exactly
        assert_eq!(out.len(), input.len());
        for (a, b) in input.iter().zip(out.iter()) {
            assert!((a - b).abs() < 1e-9);
        }
    }

    #[test]
    fn last_frame_is_zero_padded_but_output_is_not() {
        let input: Vec<f32> = vec![1.0; 500];
        // Frame size 480, so the second frame sees [data, data, ..., 0, 0, ...].
        // The chunker should still emit only `500` samples in total.
        let out = process_frames(&input, 480, |frame| {
            assert_eq!(frame.len(), 480, "every frame is the full size");
            Ok(frame.to_vec())
        })
        .unwrap();
        assert_eq!(out.len(), 500);
    }

    #[test]
    fn empty_input_produces_empty_output_without_calling_f() {
        let mut calls = 0;
        let out = process_frames(&[], 480, |frame| {
            calls += 1;
            Ok(frame.to_vec())
        })
        .unwrap();
        assert!(out.is_empty());
        assert_eq!(calls, 0);
    }

    #[test]
    fn passthrough_denoise_returns_input_when_onnx_feature_is_off() {
        // This compiles regardless of the feature thanks to the cfg-gated
        // `denoise` re-export. With feature off, it's a no-op.
        #[cfg(not(feature = "onnx"))]
        {
            let input = vec![0.1, 0.2, 0.3];
            let out = denoise(&input, std::path::Path::new("nope")).unwrap();
            assert_eq!(out, input);
        }
    }
}
