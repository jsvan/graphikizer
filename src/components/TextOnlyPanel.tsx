"use client";

import type { ComicPanel, TextOverlay } from "@/lib/types";

const TEXT_ONLY_BACKGROUNDS = [
  "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900",
  "bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900",
  "bg-gradient-to-br from-zinc-900 via-neutral-800 to-zinc-900",
  "bg-gradient-to-br from-gray-900 via-stone-800 to-gray-900",
];

function TextOnlyOverlay({ overlay }: { overlay: TextOverlay }) {
  if (overlay.type === "narration") {
    return (
      <div className="text-amber-50 italic text-center max-w-lg mx-auto text-sm leading-relaxed">
        {overlay.text}
      </div>
    );
  }

  if (overlay.type === "dialogue") {
    return (
      <div className="max-w-md mx-auto">
        {overlay.speaker && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1 block">
            {overlay.speaker}
          </span>
        )}
        <div className="bg-white/10 rounded-lg px-4 py-2.5 text-gray-100 text-sm leading-relaxed">
          {overlay.text}
        </div>
      </div>
    );
  }

  // caption
  return (
    <div className="text-amber-300 uppercase text-xs tracking-widest text-center font-semibold">
      {overlay.text}
    </div>
  );
}

export function TextOnlyPanelContent({ panel }: { panel: ComicPanel }) {
  const bg = TEXT_ONLY_BACKGROUNDS[panel.panelIndex % TEXT_ONLY_BACKGROUNDS.length];

  return (
    <div
      className={`${bg} w-full h-full flex flex-col items-center justify-center space-y-3 p-6`}
      style={{ minHeight: 200 }}
    >
      {panel.overlays.map((overlay, i) => (
        <TextOnlyOverlay key={i} overlay={overlay} />
      ))}
    </div>
  );
}
