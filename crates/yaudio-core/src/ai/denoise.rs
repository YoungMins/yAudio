//! ONNX-backed denoiser. Compiled only with the `onnx` feature so the
//! rest of the workspace keeps building (and testing) without the ORT
//! dynamic library on the host.

use crate::error::{AudioError, AudioResult};
use std::path::Path;

/// Run a single-input / single-output ONNX denoising model over an
/// already-mono PCM buffer. The model is expected to map a frame of
/// f32 audio samples to the same number of f32 samples (e.g. RNNoise
/// in its ONNX export).
pub fn denoise(samples: &[f32], model_path: &Path) -> AudioResult<Vec<f32>> {
    use ndarray::Array1;
    use ort::{session::Session, value::Value};

    let session = Session::builder()
        .map_err(|e| AudioError::External(format!("ort builder: {e}")))?
        .commit_from_file(model_path)
        .map_err(|e| AudioError::External(format!("load {}: {e}", model_path.display())))?;

    // Treat the whole buffer as one input tensor for now. Real RNNoise
    // would step at 480-sample frames; we keep this simple so the
    // command works for arbitrary models that take 1-D float input.
    let input = Array1::from_vec(samples.to_vec());
    let value = Value::from_array(input)
        .map_err(|e| AudioError::External(format!("ort tensor: {e}")))?;

    let inputs = ort::inputs!["input" => value]
        .map_err(|e| AudioError::External(format!("ort inputs: {e}")))?;
    let outputs = session
        .run(inputs)
        .map_err(|e| AudioError::External(format!("ort run: {e}")))?;

    let (_shape, data) = outputs
        .iter()
        .next()
        .ok_or_else(|| AudioError::External("ort: no output tensor".into()))?
        .1
        .try_extract_raw_tensor::<f32>()
        .map_err(|e| AudioError::External(format!("ort extract: {e}")))?;
    Ok(data.to_vec())
}
