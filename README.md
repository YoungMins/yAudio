# 🎵 yAudio

> **AI-Powered Open Source Sound Utility** — Privacy-First, Local-Only

yAudio is a high-performance, cross-platform audio editor that runs every
piece of analysis and inference on your own machine. No cloud, no upload,
no telemetry.

![License](https://img.shields.io/badge/license-MIT-8B5CF6)
![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131)
![Rust](https://img.shields.io/badge/Rust-stable-orange)

---

## ✨ Features

### Core Tools
- **Non-destructive editing** with infinite undo / redo
- **Smart drag & merge** — clip snapping and automatic crossfades
- **Smart compression** — pick a target file size, the encoder picks the bitrate
- **Multi-format conversion** — MP3 / WAV / FLAC / OGG / AAC / M4A

### AI Intelligence (local only)
- 🔗 **Magic Link** — pull audio from a URL through a local `yt-dlp`
- ✨ **Noise Clean** — speech-enhancement denoiser (GTCRN ONNX)
- 🎤 **Stem Split** — separate vocals / drums / bass / other (Demucs ONNX, manual import)
- 🔇 **Silence Trim** — remove regions below a configurable dB threshold

> **Model manager**: open from the header (CPU icon). Models live under
> `app_data_dir/models/` and are never re-hosted by yAudio. Use the
> per-row **Import** button to bring your own `.onnx` file when a public
> single-file mirror isn't available.

---

## 🛠 Tech Stack

| Layer | Tech |
| :--- | :--- |
| Framework | Tauri 2.0 |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Core engine | Rust + Symphonia + FFmpeg |
| Visualization | WebGPU (Canvas2D fallback) |
| AI runtime | ONNX Runtime via `ort` (opt-in feature) |

---

## 🚀 Getting Started

```bash
# Prerequisites: Node.js 20+, Rust 1.75+, FFmpeg, yt-dlp
npm install
npm run tauri dev      # development
npm run tauri build    # production bundle
```

Optional system dependencies:

```bash
# Ubuntu / Debian
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev pkg-config build-essential libsoup-3.0-dev

# macOS
xcode-select --install
```

Production bundles land in `src-tauri/target/release/bundle/`.

---

## 🧪 Tests (TDD)

This project follows test-driven development.

```bash
npm run test          # Vitest (frontend pure logic)
npm run test:rust     # cargo test -p yaudio-core (audio engine)
npm run test:all      # both
```

**Layout**

- `crates/yaudio-core/` — pure-Rust core (decoder, timeline editor,
  silence detection, render pipeline). No Tauri / GTK dependency, so
  the test suite runs anywhere.
- `src-tauri/` — Tauri binary that wires `yaudio-core` to the OS:
  AI model manager, `yt-dlp` integration, IPC commands.
- `src/` — React frontend. Pure helpers live in `src/lib/` and are
  unit-tested there.

**TDD loop**

1. Write a failing test (`#[test]` or `it(...)`).
2. Make the smallest change that turns it green.
3. Refactor, then verify the rest of the suite is still green.

---

## 🤖 ONNX Inference (optional)

Default builds skip the ONNX Runtime so CI stays fast. To enable real
inference, build with the `onnx` feature. The native ORT library is
fetched on first use by `ort`'s `load-dynamic` mode.

```bash
cargo build -p yaudio --features onnx --release
# or, end-to-end:
npm run tauri build -- --features onnx
```

When the feature is off, `run_ai` simply verifies the model file is
present and copies the source through — the UI flow stays intact.

---

## 🗺 Roadmap

- [x] Phase 1: Tauri + Rust core engine, theme system
- [x] Phase 2: WebGPU waveform renderer, basic editing UI
- [x] Phase 3: Local model manager, ONNX runtime integration (opt-in)
- [ ] Phase 4: Plugin system, v1.0.0 release

---

## 💜 Support

yAudio is open source under the MIT License. Donations toward the
project are welcome via [Ko-fi](https://ko-fi.com/youngminkim).

Pull requests, issues and design feedback are always appreciated.
