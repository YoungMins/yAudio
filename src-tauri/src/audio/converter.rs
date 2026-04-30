use crate::error::{AudioError, AudioResult};
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct ConvertResult {
    pub output: String,
    pub bitrate_kbps: Option<u32>,
}

/// Convert via system FFmpeg. Yes, we shell out — Symphonia is
/// decode-only and writing a polished MP3/OGG/AAC encoder in Rust is
/// out of scope for an MVP.
pub fn convert(
    input: &str,
    output: &str,
    format: &str,
    bitrate_kbps: Option<u32>,
) -> AudioResult<ConvertResult> {
    let format = format.to_lowercase();
    if !matches!(format.as_str(), "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a") {
        return Err(AudioError::UnsupportedFormat(format));
    }

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(input);

    match format.as_str() {
        "mp3" => {
            cmd.arg("-codec:a").arg("libmp3lame");
            if let Some(b) = bitrate_kbps {
                cmd.arg("-b:a").arg(format!("{}k", b));
            }
        }
        "wav" => {
            cmd.arg("-codec:a").arg("pcm_s16le");
        }
        "flac" => {
            cmd.arg("-codec:a").arg("flac");
        }
        "ogg" => {
            cmd.arg("-codec:a").arg("libvorbis");
            if let Some(b) = bitrate_kbps {
                cmd.arg("-b:a").arg(format!("{}k", b));
            }
        }
        "aac" | "m4a" => {
            cmd.arg("-codec:a").arg("aac");
            if let Some(b) = bitrate_kbps {
                cmd.arg("-b:a").arg(format!("{}k", b));
            }
        }
        _ => unreachable!(),
    }

    cmd.arg(output);
    let status = cmd
        .status()
        .map_err(|e| AudioError::External(format!("ffmpeg launch: {e}")))?;

    if !status.success() {
        return Err(AudioError::External(format!(
            "ffmpeg exited with status {status}"
        )));
    }

    Ok(ConvertResult {
        output: output.to_string(),
        bitrate_kbps,
    })
}

/// Estimate the bitrate (kbps) needed to fit `duration_secs` audio
/// inside a target file size in megabytes. Reserves ~5% for container overhead.
pub fn estimate_bitrate(duration_secs: f64, target_mb: f64) -> u32 {
    if duration_secs <= 0.0 || target_mb <= 0.0 {
        return 128;
    }
    let target_bits = target_mb * 1024.0 * 1024.0 * 8.0 * 0.95;
    let kbps = (target_bits / duration_secs / 1000.0).round() as i64;
    kbps.clamp(32, 320) as u32
}
