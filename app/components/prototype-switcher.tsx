// PROTOTYPE — throwaway variant switcher (wayfinder ticket #9). Hidden in production.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  VARIANTS,
  usePrototypeVariant,
  useNotificationsPrototype,
  CHANNELS,
} from "~/components/notifications-prototype/store";

export function PrototypeSwitcher() {
  const [current, setVariant] = usePrototypeVariant();
  const s = useNotificationsPrototype();
  const [showState, setShowState] = useState(false);
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const go = (d: number) =>
    setVariant(VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  const delivery = s.types.map((t) => ({
    type: t,
    ...Object.fromEntries(CHANNELS.map((c) => [c.label, s.delivers(t, c.key) ? "✓" : "·"])),
  }));

  return (
    <div className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2">
      {showState && (
        <pre className="mb-2 max-h-80 w-[28rem] overflow-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-snug text-lime-300 shadow-2xl">
          {JSON.stringify(
            {
              role: s.role,
              isTeamManager: s.isTeamManager,
              unread: s.unread,
              browserPermission: s.browserPermission,
              mute: s.mute,
              wouldDeliver: delivery,
            },
            null,
            1
          )}
        </pre>
      )}
      <div className="flex items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1 text-sm font-medium text-white shadow-xl ring-2 ring-white">
        <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20" title="Previous (←)">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2">
          PROTOTYPE {current} ({VARIANTS[idx]?.name})
        </span>
        <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20" title="Next (→)">
          <ChevronRight className="size-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-white/40" />
        <button onClick={() => setShowState((v) => !v)} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/20">
          {showState ? "hide state" : "state"}
        </button>
        <button onClick={s.reseed} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/20" title="Reload fake feed">
          reseed
        </button>
        <button onClick={s.clearAll} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/20" title="Empty the feed">
          empty
        </button>
        <button onClick={() => s.setBrowserPermission("default")} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/20" title="Reset simulated Browser permission">
          reset perm
        </button>
      </div>
    </div>
  );
}
