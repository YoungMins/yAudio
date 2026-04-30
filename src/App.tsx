import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Inspector } from "./components/Inspector";
import { MagicLinkDialog } from "./components/MagicLinkDialog";
import { MagicToolbar } from "./components/MagicToolbar";
import { MainCanvas } from "./components/MainCanvas";
import { ModelManager } from "./components/ModelManager";
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

  // Refresh model status on launch so toolbar gating works immediately.
  useEffect(() => {
    void tauri.listModels().then(setModels).catch(() => {});
  }, [setModels]);

  function modelFor(feature: AiFeature): ModelInfo | undefined {
    return models.find((m) => m.id === MODEL_FOR_FEATURE[feature]);
  }

  async function ensureModel(feature: AiFeature): Promise<ModelInfo | null> {
    const id = MODEL_FOR_FEATURE[feature];
    let m = modelFor(feature);
    if (!m) {
      const list = await tauri.listModels();
      setModels(list);
      m = list.find((x) => x.id === id);
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

  return (
    <div className="flex h-screen flex-col">
      <Header onOpenModels={() => openModelManager(null)} />
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
    </div>
  );
}
