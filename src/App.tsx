import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Inspector } from "./components/Inspector";
import { MagicLinkDialog } from "./components/MagicLinkDialog";
import { MagicToolbar } from "./components/MagicToolbar";
import { MainCanvas } from "./components/MainCanvas";
import { ModelManager } from "./components/ModelManager";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { modelForFeature } from "./lib/models";
import { tauri } from "./lib/tauri";
import { useApp } from "./store/appStore";
import { MODEL_FOR_FEATURE, type AiFeature, type ModelInfo } from "./types/audio";

export default function App() {
  const setWaveform = useApp((s) => s.setWaveform);
  const addEffect = useApp((s) => s.addEffect);
  const meta = useApp((s) => s.meta);
  const models = useApp((s) => s.models);
  const setModels = useApp((s) => s.setModels);
  const openModelManager = useApp((s) => s.openModelManager);

  const [magicOpen, setMagicOpen] = useState(false);
  const { audioRef } = useAudioPlayer();

  // Refresh model status on launch so toolbar gating works immediately.
  useEffect(() => {
    void tauri.listModels().then(setModels).catch(() => {});
  }, [setModels]);

  // Cmd/Ctrl+O dispatched from anywhere opens the file picker.
  useEffect(() => {
    const handler = () => void handleOpenFile();
    window.addEventListener("yaudio:open-file", handler as EventListener);
    return () => window.removeEventListener("yaudio:open-file", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureModel(feature: AiFeature): Promise<ModelInfo | null> {
    const id = MODEL_FOR_FEATURE[feature];
    let m = modelForFeature(models, feature);
    if (!m) {
      const list = await tauri.listModels();
      setModels(list);
      m = modelForFeature(list, feature);
    }
    if (!m || m.status !== "installed") {
      openModelManager(id);
      return null;
    }
    return m;
  }

  async function handleOpenFile() {
    let path: string | null = null;
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const picked = await dialog.open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "wav", "flac", "ogg", "aac", "m4a"],
          },
        ],
      });
      path = typeof picked === "string" ? picked : null;
    } catch {
      path = "demo.wav";
    }
    if (!path) return;
    const wf = await tauri.extractWaveform(path, 2_000);
    setWaveform(wf);
  }

  async function handleClean() {
    if (!meta) return;
    const m = await ensureModel("clean");
    if (!m) return;
    await tauri.runAi(m.id, meta.path);
    addEffect("AI Noise Clean");
  }

  async function handleSplit() {
    if (!meta) return;
    const m = await ensureModel("split");
    if (!m) return;
    await tauri.runAi(m.id, meta.path);
    addEffect("AI Stem Split");
  }

  function triggerExport() {
    window.dispatchEvent(new CustomEvent("yaudio:export"));
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        onOpenModels={() => openModelManager(null)}
        onOpenFile={handleOpenFile}
        onMagicLink={() => setMagicOpen(true)}
        onExport={triggerExport}
      />
      <div className="flex flex-1 overflow-hidden">
        <MagicToolbar
          onMagicLink={() => setMagicOpen(true)}
          onClean={handleClean}
          onSplit={handleSplit}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <MainCanvas onOpenFile={handleOpenFile} />
        </main>
        <Inspector />
      </div>
      <MagicLinkDialog open={magicOpen} onClose={() => setMagicOpen(false)} />
      <ModelManager />
      <audio ref={audioRef} preload="auto" />
    </div>
  );
}
