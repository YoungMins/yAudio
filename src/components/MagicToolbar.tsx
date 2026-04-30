import { Link2, MousePointer2, Scissors, Sparkles, ZoomIn, Mic2 } from "lucide-react";
import { useApp } from "../store/appStore";
import type { Tool } from "../types/audio";

interface Props {
  onMagicLink: () => void;
  onClean: () => void;
  onSplit: () => void;
}

const EDIT_TOOLS: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
  { id: "select", icon: <MousePointer2 size={18} />, label: "Select", key: "V" },
  { id: "cut", icon: <Scissors size={18} />, label: "Cut", key: "C" },
  { id: "zoom", icon: <ZoomIn size={18} />, label: "Zoom", key: "Z" },
];

export function MagicToolbar({ onMagicLink, onClean, onSplit }: Props) {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-white/5 py-4">
      <div className="flex flex-col items-center gap-1">
        {EDIT_TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`tool-btn ${tool === t.id ? "active" : ""}`}
            title={`${t.label} (${t.key})`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="my-2 h-px w-8 bg-white/10" />

      <div className="flex flex-col items-center gap-1">
        <button onClick={onMagicLink} className="tool-btn" title="Magic Link">
          <Link2 size={18} />
        </button>
        <button onClick={onClean} className="tool-btn" title="AI Clean">
          <Sparkles size={18} />
        </button>
        <button onClick={onSplit} className="tool-btn" title="Stem Split">
          <Mic2 size={18} />
        </button>
      </div>
    </aside>
  );
}
