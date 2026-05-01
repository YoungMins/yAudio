use yaudio_core::error::{AudioError, AudioResult};
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize)]
pub struct ModelDef {
    pub id: &'static str,
    pub name: &'static str,
    pub purpose: &'static str,
    /// Direct URL to the ONNX file. `None` means the model is import-only
    /// (the user supplies their own .onnx through the file picker).
    pub url: Option<&'static str>,
    pub filename: &'static str,
    pub size_bytes: u64,
    pub sha256: Option<&'static str>,
    pub license: &'static str,
}

/// Registry of supported local AI models. URLs point at known-public
/// mirrors of the upstream ONNX exports — yAudio never re-hosts model
/// weights; the user pulls them once into a local cache directory. When
/// no public single-file URL is available, the entry is import-only.
pub const REGISTRY: &[ModelDef] = &[
    ModelDef {
        id: "rnnoise",
        name: "GTCRN denoiser (ONNX)",
        purpose: "AI Noise Clean — speech enhancement",
        // Mirror maintained by the sherpa-onnx project.
        url: Some(
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/gtcrn_simple.onnx",
        ),
        filename: "rnnoise.onnx",
        size_bytes: 1_300_000,
        sha256: None,
        license: "Apache-2.0",
    },
    ModelDef {
        id: "demucs-htdemucs",
        name: "Demucs htdemucs (ONNX)",
        purpose: "AI Stem Split — vocals / drums / bass / other",
        // Public direct ONNX exports are not available; fetch a Demucs
        // ONNX from your own source and import it via the manager.
        url: None,
        filename: "htdemucs.onnx",
        size_bytes: 83_000_000,
        sha256: None,
        license: "MIT",
    },
    ModelDef {
        id: "silero-vad",
        name: "Silero VAD",
        purpose: "Smart silence detection — voice activity",
        url: Some(
            "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx",
        ),
        filename: "silero_vad.onnx",
        size_bytes: 1_800_000,
        sha256: None,
        license: "MIT",
    },
];

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelStatus {
    NotInstalled,
    Downloading,
    Installed,
    Corrupted,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    #[serde(flatten)]
    pub def: ModelDef,
    pub status: ModelStatus,
    pub local_path: Option<String>,
    pub on_disk_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub received: u64,
    pub total: u64,
    pub done: bool,
    pub error: Option<String>,
}

static IN_FLIGHT: Lazy<Mutex<HashMap<String, ()>>> = Lazy::new(Default::default);

pub fn models_dir(app: &AppHandle) -> AudioResult<PathBuf> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AudioError::External(format!("app_data_dir: {e}")))?;
    dir.push("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn lookup(id: &str) -> Option<&'static ModelDef> {
    REGISTRY.iter().find(|m| m.id == id)
}

pub fn list(app: &AppHandle) -> AudioResult<Vec<ModelInfo>> {
    let dir = models_dir(app)?;
    let in_flight = IN_FLIGHT.lock().unwrap();
    Ok(REGISTRY
        .iter()
        .map(|def| {
            let path = dir.join(def.filename);
            let (status, on_disk, local) = if in_flight.contains_key(def.id) {
                (ModelStatus::Downloading, None, None)
            } else if path.exists() {
                let bytes = std::fs::metadata(&path).ok().map(|m| m.len());
                let status = match bytes {
                    Some(b) if b >= def.size_bytes / 2 => ModelStatus::Installed,
                    Some(_) => ModelStatus::Corrupted,
                    None => ModelStatus::NotInstalled,
                };
                (status, bytes, Some(path.to_string_lossy().to_string()))
            } else {
                (ModelStatus::NotInstalled, None, None)
            };
            ModelInfo {
                def: def.clone(),
                status,
                local_path: local,
                on_disk_bytes: on_disk,
            }
        })
        .collect())
}

pub async fn download(app: AppHandle, id: String) -> AudioResult<()> {
    let def = lookup(&id)
        .ok_or_else(|| AudioError::External(format!("unknown model: {id}")))?;
    {
        let mut g = IN_FLIGHT.lock().unwrap();
        if g.contains_key(&id) {
            return Err(AudioError::External("already downloading".into()));
        }
        g.insert(id.clone(), ());
    }

    let dir = models_dir(&app)?;
    let final_path = dir.join(def.filename);
    let tmp_path = dir.join(format!("{}.partial", def.filename));

    let result = stream_to_file(&app, def, &tmp_path, &final_path).await;

    IN_FLIGHT.lock().unwrap().remove(&id);

    let _ = app.emit(
        "model:progress",
        DownloadProgress {
            id: id.clone(),
            received: 0,
            total: def.size_bytes,
            done: result.is_ok(),
            error: result.as_ref().err().map(|e| e.to_string()),
        },
    );
    result
}

async fn stream_to_file(
    app: &AppHandle,
    def: &ModelDef,
    tmp_path: &Path,
    final_path: &Path,
) -> AudioResult<()> {
    let url = def.url.ok_or_else(|| {
        AudioError::External(format!(
            "{} has no public URL — use 'Import file…' to supply your own .onnx",
            def.id
        ))
    })?;

    let client = reqwest::Client::builder()
        .user_agent("yAudio/0.1 (+https://github.com/youngmins/yaudio)")
        .build()
        .map_err(|e| AudioError::External(format!("http client: {e}")))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AudioError::External(format!("GET {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(AudioError::External(format!(
            "HTTP {} from {url}",
            resp.status()
        )));
    }
    let total = resp.content_length().unwrap_or(def.size_bytes);

    let mut file = fs::File::create(tmp_path).await?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes =
            chunk.map_err(|e| AudioError::External(format!("download chunk: {e}")))?;
        hasher.update(&bytes);
        file.write_all(&bytes).await?;
        received += bytes.len() as u64;

        if received - last_emit > 64 * 1024 {
            last_emit = received;
            let _ = app.emit(
                "model:progress",
                DownloadProgress {
                    id: def.id.to_string(),
                    received,
                    total,
                    done: false,
                    error: None,
                },
            );
        }
    }
    file.flush().await?;
    drop(file);

    if let Some(expected) = def.sha256 {
        let got = hex::encode(hasher.finalize());
        if !got.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(tmp_path).await;
            return Err(AudioError::External(format!(
                "sha256 mismatch: expected {expected}, got {got}"
            )));
        }
    }

    fs::rename(tmp_path, final_path).await?;
    Ok(())
}

/// Copy a user-supplied .onnx file from `source_path` into the models
/// directory under the registry's expected filename. Used as a manual
/// fallback when a model has no public URL or its mirror is unreachable.
pub async fn import(app: AppHandle, id: String, source_path: String) -> AudioResult<()> {
    let def = lookup(&id)
        .ok_or_else(|| AudioError::External(format!("unknown model: {id}")))?;
    let dst = models_dir(&app)?.join(def.filename);
    fs::copy(&source_path, &dst)
        .await
        .map_err(|e| AudioError::External(format!("import {source_path} → {}: {e}", dst.display())))?;
    Ok(())
}

pub async fn delete(app: AppHandle, id: String) -> AudioResult<()> {
    let def = lookup(&id)
        .ok_or_else(|| AudioError::External(format!("unknown model: {id}")))?;
    let path = models_dir(&app)?.join(def.filename);
    if path.exists() {
        fs::remove_file(path).await?;
    }
    Ok(())
}

pub fn require_installed(app: &AppHandle, id: &str) -> AudioResult<PathBuf> {
    let def = lookup(id)
        .ok_or_else(|| AudioError::External(format!("unknown model: {id}")))?;
    let path = models_dir(app)?.join(def.filename);
    if !path.exists() {
        return Err(AudioError::External(format!(
            "model not installed: {id}"
        )));
    }
    Ok(path)
}
