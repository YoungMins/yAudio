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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_inputs_fall_back_to_default() {
        assert_eq!(estimate_bitrate(0.0, 5.0), 128);
        assert_eq!(estimate_bitrate(-1.0, 5.0), 128);
        assert_eq!(estimate_bitrate(60.0, 0.0), 128);
        assert_eq!(estimate_bitrate(60.0, -2.0), 128);
    }

    #[test]
    fn output_is_clamped_to_supported_range() {
        // tiny target → clamp up to 32
        assert_eq!(estimate_bitrate(3600.0, 0.5), 32);
        // huge target → clamp down to 320
        assert_eq!(estimate_bitrate(10.0, 1000.0), 320);
    }

    #[test]
    fn sane_three_minute_three_megabyte_target_lands_in_128k_band() {
        // 180s, 3MB, 5% overhead reserve → ~133 kbps
        let kbps = estimate_bitrate(180.0, 3.0);
        assert!((120..=160).contains(&kbps), "expected ~128–160, got {kbps}");
    }

    #[test]
    fn doubling_target_doubles_bitrate_when_unclamped() {
        let a = estimate_bitrate(300.0, 4.0) as i64;
        let b = estimate_bitrate(300.0, 8.0) as i64;
        // allow ±2 kbps rounding wiggle
        assert!((b - a * 2).abs() <= 2, "a={a} b={b}");
    }
}
