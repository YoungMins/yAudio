pub mod models;

use yaudio_core::error::{AudioError, AudioResult};
use serde::Serialize;
use std::env;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct MagicLinkResult {
    pub local_path: String,
    pub title: Option<String>,
}

/// Magic Link: shell out to local `yt-dlp` and pull the best audio stream
/// into the OS temp directory. No network calls leave the machine beyond
/// what the user explicitly requests via the URL.
pub async fn magic_link_extract(url: &str) -> AudioResult<MagicLinkResult> {
    let mut tmp = env::temp_dir();
    tmp.push("yaudio");
    std::fs::create_dir_all(&tmp)?;

    let template = tmp.join("%(id)s.%(ext)s");
    let template_str = template.to_string_lossy().to_string();

    let output = Command::new("yt-dlp")
        .args([
            "-x",
            "--audio-format",
            "wav",
            "--no-playlist",
            "--print",
            "after_move:filepath",
            "-o",
            &template_str,
            url,
        ])
        .output()
        .map_err(|e| AudioError::External(format!("yt-dlp launch: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AudioError::External(format!("yt-dlp failed: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let local_path = stdout
        .lines()
        .last()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AudioError::External("yt-dlp returned no path".into()))?;

    Ok(MagicLinkResult {
        local_path,
        title: None,
    })
}

#[derive(Debug, Serialize)]
pub struct AiRunResult {
    pub model_id: String,
    pub output_path: String,
}

/// Run an installed ONNX model over `input_path`'s audio and write the
/// processed result next to the input. Falls back to a passthrough
/// (file copy of the decoded mono PCM) when yaudio-core was built
/// without the `onnx` feature, so the UI flow always completes.
pub fn run_inference(
    app: &AppHandle,
    model_id: &str,
    input_path: &str,
) -> AudioResult<AiRunResult> {
    let model_path = models::require_installed(app, model_id)?;
    let (samples, meta) = yaudio_core::audio::decoder::decode_to_mono(input_path)?;
    let processed = yaudio_core::ai::denoise(&samples, &model_path)?;

    let output_path = format!("{input_path}.processed.wav");
    yaudio_core::audio::render::write_wav(
        std::path::Path::new(&output_path),
        &processed,
        meta.sample_rate,
    )?;

    Ok(AiRunResult {
        model_id: model_id.to_string(),
        output_path,
    })
}
