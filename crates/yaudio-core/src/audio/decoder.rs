use crate::error::{AudioError, AudioResult};
use serde::Serialize;
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

#[derive(Debug, Serialize, Clone)]
pub struct AudioMeta {
    pub path: String,
    pub duration_secs: f64,
    pub sample_rate: u32,
    pub channels: u16,
    pub codec: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct WaveformPayload {
    pub meta: AudioMeta,
    /// Min/max envelope per bucket interleaved [min0, max0, min1, max1, ...]
    pub peaks: Vec<f32>,
    pub bucket_count: usize,
}

fn open_format(path: &str) -> AudioResult<(Box<dyn FormatReader>, usize)> {
    let file = File::open(path)?;
    let size = file.metadata()?.len();
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;

    let format = probed.format;
    let track_idx = format
        .tracks()
        .iter()
        .position(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or(AudioError::NoTrack)?;

    Ok((format, size as usize))
}

pub fn load_metadata(path: &str) -> AudioResult<AudioMeta> {
    let (format, size) = open_format(path)?;
    let track = format.default_track().ok_or(AudioError::NoTrack)?;
    let params = &track.codec_params;

    let sample_rate = params.sample_rate.unwrap_or(44_100);
    let channels = params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);

    let duration_secs = match (params.n_frames, params.sample_rate) {
        (Some(frames), Some(sr)) => frames as f64 / sr as f64,
        _ => 0.0,
    };

    Ok(AudioMeta {
        path: path.to_string(),
        duration_secs,
        sample_rate,
        channels,
        codec: format!("{:?}", params.codec),
        size_bytes: size as u64,
    })
}

/// Decode the entire file and produce a min/max envelope waveform of `target_points` buckets.
pub fn extract_waveform(path: &str, target_points: usize) -> AudioResult<WaveformPayload> {
    let meta = load_metadata(path)?;
    let (mut format, _) = open_format(path)?;
    let track = format.default_track().ok_or(AudioError::NoTrack)?;
    let track_id = track.id;

    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;

    let mut samples: Vec<f32> = Vec::with_capacity(1_024 * 1_024);

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(e.into()),
        };
        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(e.into()),
        };

        accumulate_mono(&decoded, &mut samples);
    }

    let buckets = target_points.max(1);
    let mut peaks = vec![0.0f32; buckets * 2];
    if samples.is_empty() {
        return Ok(WaveformPayload {
            meta,
            peaks,
            bucket_count: buckets,
        });
    }

    let chunk = (samples.len() as f64 / buckets as f64).max(1.0);
    for i in 0..buckets {
        let start = (i as f64 * chunk) as usize;
        let end = (((i + 1) as f64) * chunk) as usize;
        let end = end.min(samples.len());
        if start >= end {
            continue;
        }
        let slice = &samples[start..end];
        let mut min = f32::INFINITY;
        let mut max = f32::NEG_INFINITY;
        for &s in slice {
            if s < min {
                min = s;
            }
            if s > max {
                max = s;
            }
        }
        peaks[i * 2] = min;
        peaks[i * 2 + 1] = max;
    }

    Ok(WaveformPayload {
        meta,
        peaks,
        bucket_count: buckets,
    })
}

fn accumulate_mono(buf: &AudioBufferRef<'_>, out: &mut Vec<f32>) {
    use symphonia::core::sample::Sample;
    macro_rules! mix {
        ($buffer:expr, $convert:expr) => {{
            let buffer = $buffer;
            let frames = buffer.frames();
            let chans = buffer.spec().channels.count();
            for f in 0..frames {
                let mut sum = 0.0f32;
                for c in 0..chans {
                    sum += $convert(buffer.chan(c)[f]);
                }
                out.push(sum / chans as f32);
            }
        }};
    }
    match buf {
        AudioBufferRef::F32(b) => mix!(b.as_ref(), |s: f32| s),
        AudioBufferRef::S32(b) => mix!(b.as_ref(), |s: i32| (s as f32) / i32::MAX as f32),
        AudioBufferRef::S16(b) => mix!(b.as_ref(), |s: i16| (s as f32) / i16::MAX as f32),
        AudioBufferRef::U8(b) => mix!(b.as_ref(), |s: u8| (s as f32 - 128.0) / 128.0),
        AudioBufferRef::U16(b) => mix!(b.as_ref(), |s: u16| (s as f32 - 32_768.0) / 32_768.0),
        AudioBufferRef::U32(b) => mix!(b.as_ref(), |s: u32| {
            (s as f64 - i32::MAX as f64) as f32 / i32::MAX as f32
        }),
        AudioBufferRef::S8(b) => mix!(b.as_ref(), |s: i8| (s as f32) / i8::MAX as f32),
        AudioBufferRef::S24(b) => mix!(b.as_ref(), |s: symphonia::core::sample::i24| {
            s.inner() as f32 / 8_388_607.0
        }),
        AudioBufferRef::U24(b) => mix!(b.as_ref(), |s: symphonia::core::sample::u24| {
            (s.inner() as f32 - 8_388_608.0) / 8_388_608.0
        }),
        AudioBufferRef::F64(b) => mix!(b.as_ref(), |s: f64| s as f32),
    }
    let _ = <f32 as Sample>::MID;
}
