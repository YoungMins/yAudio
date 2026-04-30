import {
  Coffee,
  Github,
  Moon,
  Pause,
  Play,
  Square,
  Sun,
} from "lucide-react";
import { useApp } from "../store/appStore";

const MENU = ["File", "Edit", "View", "Help"];

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "00:00.00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const cs = Math.floor((secs - Math.floor(secs)) * 100);
  return `${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export function Header() {
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const isPlaying = useApp((s) => s.isPlaying);
  const setPlaying = useApp((s) => s.setPlaying);
  const cursor = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);
  const meta = useApp((s) => s.meta);

  const duration = meta?.duration_secs ?? 0;

  return (
    <header className="flex h-12 items-center gap-4 border-b border-white/5 px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-glass accent-bg font-semibold text-white">
          y
        </div>
        <span className="font-semibold tracking-tight">yAudio</span>
      </div>

      <nav className="flex items-center gap-1 text-sm text-zinc-400">
        {MENU.map((m) => (
          <button
            key={m}
            className="rounded px-2 py-1 hover:bg-white/5 hover:text-zinc-100"
          >
            {m}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-sm">
          <button
            onClick={() => setPlaying(!isPlaying)}
            className="tool-btn"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setCursor(0);
            }}
            className="tool-btn"
            title="Stop"
          >
            <Square size={14} />
          </button>
          <span className="tabular-nums text-zinc-300">
            {formatTime(cursor)}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="tabular-nums text-zinc-500">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <a
            href="https://ko-fi.com/youngminkim"
            target="_blank"
            rel="noreferrer"
            className="tool-btn"
            title="Support on Ko-fi"
          >
            <Coffee size={16} />
          </a>
          <button
            onClick={toggleTheme}
            className="tool-btn"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <a
            href="https://github.com/youngmins/yaudio"
            target="_blank"
            rel="noreferrer"
            className="tool-btn"
            title="GitHub"
          >
            <Github size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}
