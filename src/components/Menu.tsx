import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface Props {
  label: string;
  items: MenuItem[];
}

/**
 * Lightweight dropdown menu used by the global header. Closes on outside
 * click or Escape; renders as a glass-panel popover anchored to the trigger.
 */
export function Menu({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded px-2 py-1 hover:bg-white/5 hover:text-zinc-100 ${
          open ? "bg-white/5 text-zinc-100" : ""
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="glass absolute left-0 top-full z-30 mt-1 min-w-[200px] py-1 text-zinc-200 shadow-2xl">
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1 h-px bg-white/5" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-white/5 disabled:opacity-40"
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="ml-6 font-mono text-[10px] text-zinc-500">
                    {item.shortcut}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
