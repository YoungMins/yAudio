import { useEffect, useState } from "react";
import { normalizationGainDb, peakOfWaveform } from "./lib/audioMath";
import { BatchExportDialog } from "./components/BatchExportDialog";
import { BatchFadeDialog } from "./components/BatchFadeDialog";
import { FileList } from "./components/FileList";
import { Header } from "./components/Header";
import { Inspector } from "./components/Inspector";
import { MagicLinkDialog } from "./components/MagicLinkDialog";
import { MagicToolbar } from "./components/MagicToolbar";
import { MainCanvas } from "./components/MainCanvas";
import { ModelManager } from "./components/ModelManager";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { modelForFeature } from "./lib/models";
import { tauri } from "./lib/tauri";
import { useApp, type DocEntry } from "./store/appStore";
import { MODEL_FOR_FEATURE, type AiFeature, type ModelInfo } from "./types/audio";

interface BatchProgress {
  label: string;
  current: number;
  total: number;
}

export default function App() {
  const addDocument = useApp((s) => s.addDocument);
  const addEffect = useApp((s) => s.addEffect);
  const meta = useApp((s) => s.meta);
  const models = useApp((s) => s.models);
  const setModels = useApp((s) => s.setModels);
  const openModelManager = useApp((s) => s.openModelManager);

  const [magicOpen, setMagicOpen] = useState(false);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [batchFadeOpen, setBatchFadeOpen] = useState(false);
  const [busy, setBusy] = useState<BatchProgress | null>(null);
  const { audioRef } = useAudioPlayer();

  useEffect(() => {
    void tauri.listModels().then(setModels).catch(() => {});
  }, [setModels]);

  useEffect(() => {
    const handler = () => void handleOpenFiles();
    window.addEventListener("yaudio:open-file", handler as EventListener);
    return () => window.removeEventListener("yaudio:open-file", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Window-level drag-drop for any number of files.
  useEffect(() => {
    const onDrag = async (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      const paths = files
        .map((f) => (f as File & { path?: string }).path ?? f.name)
        .filter(Boolean);
      if (paths.length === 0) return;
      await loadPaths(paths);
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener("drop", onDrag);
    window.addEventListener("dragover", onOver);
    return () => {
      window.removeEventListener("drop", onDrag);
      window.removeEventListener("dragover", onOver);
    };
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

  async function loadPaths(paths: string[]) {
    setBusy({ label: "Loading…", current: 0, total: paths.length });
    for (let i = 0; i < paths.length; i++) {
      try {
        const wf = await tauri.extractWaveform(paths[i], 2_000);
        addDocument(wf);
      } catch (e) {
        console.error("loadPaths failed for", paths[i], e);
      }
      setBusy({ label: "Loading…", current: i + 1, total: paths.length });
    }
    setBusy(null);
  }

  async function handleOpenFiles() {
    let paths: string[] = [];
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const picked = await dialog.open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "wav", "flac", "ogg", "aac", "m4a"],
          },
        ],
      });
      if (Array.isArray(picked)) paths = picked;
      else if (typeof picked === "string") paths = [picked];
    } catch {
      paths = ["demo.wav"];
    }
    if (paths.length === 0) return;
    await loadPaths(paths);
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

  function selectedDocs(): DocEntry[] {
    return useApp.getState().library.filter((d) => d.selectedForBatch);
  }

  async function batchClean() {
    const docs = selectedDocs();
    if (docs.length === 0) return;
    const m = await ensureModel("clean");
    if (!m) return;
    setBusy({ label: "AI Clean…", current: 0, total: docs.length });
    for (let i = 0; i < docs.length; i++) {
      try {
        await tauri.runAi(m.id, docs[i].meta.path);
      } catch (e) {
        console.error("batch clean failed for", docs[i].meta.path, e);
      }
      setBusy({ label: "AI Clean…", current: i + 1, total: docs.length });
    }
    setBusy(null);
  }

  function batchNormalize() {
    const docs = selectedDocs();
    if (docs.length === 0) return;
    setBusy({ label: "Normalize…", current: 0, total: docs.length });
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const peak = peakOfWaveform(doc.waveform.peaks);
      const db = Math.max(-24, Math.min(12, normalizationGainDb(peak, -1)));
      doc.timeline.applyTimelineGainDb(db);
      setBusy({ label: "Normalize…", current: i + 1, total: docs.length });
    }
    const id = useApp.getState().activeId;
    if (id) useApp.getState().setActiveDocument(id);
    setBusy(null);
  }

  async function batchTrimSilence() {
    const docs = selectedDocs();
    if (docs.length === 0) return;
    setBusy({ label: "Trim silence…", current: 0, total: docs.length });
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      try {
        const ranges = await tauri.detectSilence(doc.meta.path, -40, 500);
        // Process in reverse so earlier indices stay valid as we shrink.
        for (const r of [...ranges].reverse()) {
          doc.timeline.deleteRange(r.start_secs, r.end_secs);
        }
      } catch (e) {
        console.error("batch silence trim failed for", doc.meta.path, e);
      }
      setBusy({ label: "Trim silence…", current: i + 1, total: docs.length });
    }
    // Refresh active mirror in case the active doc was modified.
    const id = useApp.getState().activeId;
    if (id) useApp.getState().setActiveDocument(id);
    setBusy(null);
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        onOpenModels={() => openModelManager(null)}
        onOpenFile={handleOpenFiles}
        onMagicLink={() => setMagicOpen(true)}
        onExport={triggerExport}
      />
      <div className="flex flex-1 overflow-hidden">
        <MagicToolbar
          onMagicLink={() => setMagicOpen(true)}
          onClean={handleClean}
          onSplit={handleSplit}
        />
        <FileList
          onAddFiles={handleOpenFiles}
          onBatchExport={() => setBatchExportOpen(true)}
          onBatchFade={() => setBatchFadeOpen(true)}
          onBatchNormalize={batchNormalize}
          onBatchClean={batchClean}
          onBatchTrimSilence={batchTrimSilence}
          busy={busy}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <MainCanvas onOpenFile={handleOpenFiles} />
        </main>
        <Inspector />
      </div>
      <MagicLinkDialog open={magicOpen} onClose={() => setMagicOpen(false)} />
      <ModelManager />
      <BatchExportDialog
        open={batchExportOpen}
        onClose={() => setBatchExportOpen(false)}
        onProgress={(current, total) =>
          setBusy(current < total ? { label: "Exporting…", current, total } : null)
        }
      />
      <BatchFadeDialog
        open={batchFadeOpen}
        onClose={() => setBatchFadeOpen(false)}
        onProgress={(current, total) =>
          setBusy(current < total ? { label: "Fading…", current, total } : null)
        }
      />
      <audio ref={audioRef} preload="auto" />
    </div>
  );
}
