use thiserror::Error;

#[derive(Debug, Error)]
pub enum AudioError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Symphonia error: {0}")]
    Symphonia(#[from] symphonia::core::errors::Error),

    #[error("Hound error: {0}")]
    Hound(#[from] hound::Error),

    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("No audio track found in file")]
    NoTrack,

    #[error("External tool failed: {0}")]
    External(String),
}

pub type AudioResult<T> = Result<T, AudioError>;
