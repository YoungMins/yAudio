# 🎵 yAudio

> **AI-Powered Open Source Sound Utility** — Privacy-First, Local-Only

yAudio는 클라우드 의존 없이 사용자의 로컬 리소스만으로 동작하는 고성능 크로스 플랫폼 사운드 편집 유틸리티입니다.

![License](https://img.shields.io/badge/license-MIT-8B5CF6)
![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131)
![Rust](https://img.shields.io/badge/Rust-stable-orange)

---

## ✨ Features

### Core Tools
- **비파괴 구간 편집** — 무한 Undo/Redo
- **스마트 드래그 & 병합** — 자동 크로스페이드
- **지능형 용량 압축** — 타겟 용량 기반 비트레이트 최적화
- **멀티 포맷 변환** — MP3 / WAV / FLAC / OGG / AAC

### AI Intelligence (Local Only)
- 🔗 **Magic Link** — `yt-dlp` 로컬 추출
- ✨ **Noise Clean** — 화이트노이즈 / 주변 소음 제거
- 🎤 **Stem Split** — 보컬 / 반주 / 드럼 분리 (Demucs ONNX)
- 🔇 **Silence Trim** — dB 임계값 기반 무음 자동 삭제

---

## 🛠 Tech Stack

| Layer | Tech |
| :--- | :--- |
| Framework | Tauri 2.0 |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Core Engine | Rust + Symphonia + FFmpeg |
| Visualization | WebGPU (`@webgpu/types`) |
| AI Models | ONNX Runtime (Demucs, RNNoise) |

---

## 🚀 Getting Started

```bash
# Prerequisites: Node.js 20+, Rust 1.75+, FFmpeg, yt-dlp
npm install
npm run tauri dev      # 개발 모드
npm run tauri build    # 프로덕션 번들
```

---

## 🗺 Roadmap

- [x] **Phase 1**: Tauri + Rust 기본 오디오 엔진 + 테마 시스템
- [x] **Phase 2**: WebGPU 파형 렌더러 + 기본 편집 UI
- [ ] **Phase 3**: 로컬 AI 모델(ONNX) 통합 + Magic Link
- [ ] **Phase 4**: 플러그인 시스템 + v1.0.0 정식 출시

---

## 💜 Support

- **Developer**: Youngmin Kim (金泳民)
- **Donation**: [Support on Ko-fi](https://ko-fi.com/youngminkim)
- **License**: MIT
