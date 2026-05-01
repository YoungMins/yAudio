#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;

use tauri::AppHandle;
use yaudio_core::audio::{converter, decoder, editor, render, silence};

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
async fn estimate_target_bitrate(duration_secs: f64, target_mb: f64) -> Result<u32, String> {
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

#[tauri::command]
fn list_models(app: AppHandle) -> Result<Vec<ai::models::ModelInfo>, String> {
    ai::models::list(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_model(app: AppHandle, id: String) -> Result<(), String> {
    ai::models::download(app, id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_model(app: AppHandle, id: String) -> Result<(), String> {
    ai::models::delete(app, id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_model(app: AppHandle, id: String, source_path: String) -> Result<(), String> {
    ai::models::import(app, id, source_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn models_dir(app: AppHandle) -> Result<String, String> {
    ai::models::models_dir(&app)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Render a timeline (sent as a serialized clip list from the frontend)
/// to a WAV file at `output`. If `convert_to` is set, runs ffmpeg to
/// transcode into the target format with optional bitrate.
#[tauri::command]
async fn export_timeline(
    clips: Vec<editor::Clip>,
    output: String,
    convert_to: Option<String>,
    bitrate_kbps: Option<u32>,
) -> Result<String, String> {
    let timeline = editor::Timeline::from_clips(clips);
    let wav_path = if convert_to.is_some() {
        format!("{output}.intermediate.wav")
    } else {
        output.clone()
    };
    render::render_timeline_to_wav(&timeline, std::path::Path::new(&wav_path))
        .map_err(|e| e.to_string())?;

    if let Some(fmt) = convert_to {
        converter::convert(&wav_path, &output, &fmt, bitrate_kbps)
            .map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&wav_path);
    }
    Ok(output)
}

#[tauri::command]
fn run_ai(
    app: AppHandle,
    model_id: String,
    input_path: String,
) -> Result<ai::AiRunResult, String> {
    ai::run_inference(&app, &model_id, &input_path).map_err(|e| e.to_string())
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
            list_models,
            download_model,
            delete_model,
            import_model,
            models_dir,
            run_ai,
            export_timeline,
        ])
        .run(tauri::generate_context!())
        .expect("yAudio failed to start");
}
