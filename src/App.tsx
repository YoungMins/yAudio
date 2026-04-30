import { useState } from "react";
import { Header } from "./components/Header";
import { Inspector } from "./components/Inspector";
import { MagicLinkDialog } from "./components/MagicLinkDialog";
import { MagicToolbar } from "./components/MagicToolbar";
import { MainCanvas } from "./components/MainCanvas";
import { tauri } from "./lib/tauri";
import { useApp } from "./store/appStore";

export default function App() {
  const setWaveform = useApp((s) => s.setWaveform);
  const addEffect = useApp((s) => s.addEffect);
  const meta = useApp((s) => s.meta);

  const [magicOpen, setMagicOpen] = useState(false);

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
      // browser preview: fall back to a fake path so the mock pipeline runs
      path = "demo.wav";
    }
    if (!path) return;
    const wf = await tauri.extractWaveform(path, 2_000);
    setWaveform(wf);
  }

  async function handleClean() {
    if (!meta) return;
    addEffect("AI Noise Clean");
  }

  async function handleSplit() {
    if (!meta) return;
    addEffect("AI Stem Split");
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
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
    </div>
  );
}
