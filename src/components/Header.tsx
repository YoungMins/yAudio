import {
  Coffee,
  Cpu,
  Github,
  Moon,
  Pause,
  Play,
  Square,
  Sun,
} from "lucide-react";
import { formatTime } from "../lib/format";
import { modelInstallCounts } from "../lib/models";
import { useApp } from "../store/appStore";
import { Menu, type MenuItem } from "./Menu";

export interface HeaderProps {
  onOpenModels: () => void;
  onOpenFile: () => void;
  onMagicLink: () => void;
  onExport: () => void;
}

export function Header({
  onOpenModels,
  onOpenFile,
  onMagicLink,
  onExport,
}: HeaderProps) {
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const isPlaying = useApp((s) => s.isPlaying);
  const setPlaying = useApp((s) => s.setPlaying);
  const cursor = useApp((s) => s.cursorSecs);
  const setCursor = useApp((s) => s.setCursor);
  const meta = useApp((s) => s.meta);
  const models = useApp((s) => s.models);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const mutateTimeline = useApp((s) => s.mutateTimeline);
  const selection = useApp((s) => s.selection);
  const setSelection = useApp((s) => s.setSelection);

  const duration = meta?.duration_secs ?? 0;
  const { installed: installedCount, total: totalCount } = modelInstallCounts(models);

  const fileMenu: MenuItem[] = [
    { label: "Open Audio…", shortcut: "⌘O", onClick: onOpenFile },
    { label: "Magic Link…", onClick: onMagicLink },
    { separator: true, label: "" },
    { label: "Export…", shortcut: "⌘E", onClick: onExport, disabled: !meta },
  ];

  const editMenu: MenuItem[] = [
    {
      label: "Undo",
      shortcut: "⌘Z",
      disabled: !canUndo,
      onClick: () => mutateTimeline((t) => t.undo()),
    },
    {
      label: "Redo",
      shortcut: "⇧⌘Z",
      disabled: !canRedo,
      onClick: () => mutateTimeline((t) => t.redo()),
    },
    { separator: true, label: "" },
    {
      label: "Cut Selection",
      shortcut: "⌫",
      disabled: !selection,
      onClick: () => {
        if (!selection) return;
        mutateTimeline((t) => t.deleteRange(selection.start, selection.end));
        setSelection(null);
      },
    },
    {
      label: "Clear Selection",
      shortcut: "Esc",
      disabled: !selection,
      onClick: () => setSelection(null),
    },
  ];

  const viewMenu: MenuItem[] = [
    {
      label: theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
      onClick: toggleTheme,
    },
    {
      label: "Open AI Model Manager",
      onClick: onOpenModels,
    },
  ];

  const helpMenu: MenuItem[] = [
    {
      label: "GitHub Repository",
      onClick: () => window.open("https://github.com/youngmins/yaudio", "_blank"),
    },
    {
      label: "Support on Ko-fi",
      onClick: () => window.open("https://ko-fi.com/youngminkim", "_blank"),
    },
    { separator: true, label: "" },
    {
      label: `yAudio v${import.meta.env.VITE_APP_VERSION ?? "0.1.0"}`,
      disabled: true,
    },
  ];

  return (
    <header className="relative flex h-12 items-center gap-4 border-b border-white/5 px-4">
      <div className="flex items-center gap-3">
        <img
          src="/yaudio-icon.png"
          alt="yAudio"
          className="h-7 w-7 rounded-full"
        />
        <span className="font-semibold tracking-tight">yAudio</span>
      </div>

      <nav className="flex items-center gap-1 text-sm text-zinc-400">
        <Menu label="File" items={fileMenu} />
        <Menu label="Edit" items={editMenu} />
        <Menu label="View" items={viewMenu} />
        <Menu label="Help" items={helpMenu} />
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-sm">
          <button
            onClick={() => setPlaying(!isPlaying)}
            className="tool-btn"
            title={isPlaying ? "Pause" : "Play"}
            disabled={!meta}
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
            disabled={!meta}
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
          <button
            onClick={onOpenModels}
            className="tool-btn flex items-center gap-1.5 px-2 text-xs"
            title="AI Model Manager"
            style={{ width: "auto" }}
          >
            <Cpu size={14} />
            <span className="font-mono">
              {totalCount > 0 ? `${installedCount}/${totalCount}` : "AI"}
            </span>
          </button>
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
