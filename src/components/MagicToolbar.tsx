import { Link2, MousePointer2, Scissors, Sparkles, ZoomIn, Mic2 } from "lucide-react";
import { useApp } from "../store/appStore";
import { MODEL_FOR_FEATURE, type AiFeature, type Tool } from "../types/audio";

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
  const models = useApp((s) => s.models);

  const isReady = (feature: AiFeature) =>
    models.find((m) => m.id === MODEL_FOR_FEATURE[feature])?.status === "installed";

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
        <AiButton
          onClick={onClean}
          ready={isReady("clean")}
          title="AI Clean (RNNoise)"
          icon={<Sparkles size={18} />}
        />
        <AiButton
          onClick={onSplit}
          ready={isReady("split")}
          title="Stem Split (Demucs)"
          icon={<Mic2 size={18} />}
        />
      </div>
    </aside>
  );
}

function AiButton({
  onClick,
  ready,
  title,
  icon,
}: {
  onClick: () => void;
  ready: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="tool-btn relative"
      title={`${title}${ready ? "" : " — 모델 다운로드 필요"}`}
    >
      {icon}
      <span
        className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
          ready ? "bg-emerald-400" : "bg-amber-400"
        }`}
      />
    </button>
  );
}
