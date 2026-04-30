#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod ai;
mod error;

use audio::{converter, decoder, silence};

#[tauri::command]
async fn load_audio(path: String) -> Result<decoder::AudioMeta, String> {
    decoder::load_metadata(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn extract_waveform(
    path: String,
    target_points: usize,
) -> Result<decoder::WaveformPayload, String> {
    decoder::extract_waveform(&path, target_points).map_err(|e| e.to_string())
}

#[tauri::command]
async fn convert_audio(
    input: String,
    output: String,
    format: String,
    bitrate_kbps: Option<u32>,
) -> Result<converter::ConvertResult, String> {
    converter::convert(&input, &output, &format, bitrate_kbps).map_err(|e| e.to_string())
}

#[tauri::command]
async fn estimate_target_bitrate(
    duration_secs: f64,
    target_mb: f64,
) -> Result<u32, String> {
    Ok(converter::estimate_bitrate(duration_secs, target_mb))
}

#[tauri::command]
async fn detect_silence(
    path: String,
    threshold_db: f32,
    min_duration_ms: u32,
) -> Result<Vec<silence::SilenceRange>, String> {
    silence::detect(&path, threshold_db, min_duration_ms).map_err(|e| e.to_string())
}

#[tauri::command]
async fn magic_link_extract(url: String) -> Result<ai::MagicLinkResult, String> {
    ai::magic_link_extract(&url).await.map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            load_audio,
            extract_waveform,
            convert_audio,
            estimate_target_bitrate,
            detect_silence,
            magic_link_extract,
        ])
        .run(tauri::generate_context!())
        .expect("yAudio failed to start");
}
