//! yaudio-core — pure-Rust audio engine for yAudio.
//!
//! Split out from the Tauri binary so the TDD test suite can run on
//! plain `cargo test` without GTK / Webkit2GTK system dependencies.

pub mod ai;
pub mod audio;
pub mod error;

pub use error::{AudioError, AudioResult};
