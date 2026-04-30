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
- ✨ **Noise Clean** — 화이트노이즈 / 주변 소음 제거 (RNNoise ONNX)
- 🎤 **Stem Split** — 보컬 / 반주 / 드럼 분리 (Demucs ONNX)
- 🔇 **Silence Trim** — dB 임계값 기반 무음 자동 삭제

> **모델 매니저**: 헤더의 `Cpu` 아이콘에서 모델을 다운로드/삭제할 수 있습니다.
> 가중치는 사용자 기기의 `app_data_dir/models/`에만 저장되며, AI 도구를 누를 때
> 모델이 없으면 매니저가 자동으로 열립니다.

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

## 🧪 Tests (TDD)

이 프로젝트는 **테스트 주도 개발(TDD)** 을 따릅니다 — 실제 첫 적용에서
`Timeline::delete_range`의 누락된 분기를 잡아냈습니다 (커밋 로그 참조).

```bash
npm run test          # Vitest (frontend pure logic)
npm run test:rust     # cargo test -p yaudio-core (audio engine)
npm run test:all      # 둘 다
```

**구조**
- `crates/yaudio-core/` — 순수 Rust 코어 (디코더, 타임라인, 무음 감지,
  비트레이트 추정). Tauri / GTK 의존성 없이 단독 테스트 가능.
- `src-tauri/` — Tauri 바이너리. `yaudio-core`를 사용하고 AI 모델 매니저,
  yt-dlp 통합, IPC 명령을 담당.
- `src/` — React 프론트엔드. 순수 함수는 `src/lib/`에 모이고 거기서 테스트.

**TDD 가이드**
1. 새 동작은 먼저 실패하는 테스트(`#[test]` 또는 `it(...)`) 를 작성합니다.
2. 가장 작은 변경으로 통과시킵니다.
3. 리팩터링하고 모든 테스트가 여전히 통과하는지 확인합니다.

## 🤖 ONNX Inference (옵션)

기본 빌드는 ONNX Runtime을 포함하지 않습니다 (CI를 가볍게 유지). 실제 추론을
사용하려면 `onnx` 피처를 켜서 빌드하세요. ORT 다이나믹 라이브러리는 `ort`
크레이트의 `load-dynamic` 모드로 첫 실행 시 자동 다운로드됩니다.

```bash
cargo build -p yaudio --features onnx --release
# 또는 Tauri:
npm run tauri build -- --features onnx
```

피처가 꺼져 있으면 `run_ai`는 모델 파일이 설치돼 있는지만 확인하고 입력
오디오를 그대로 출력으로 복사합니다 — UI 흐름은 끊기지 않습니다.

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
