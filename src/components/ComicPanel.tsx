"use client";

import type { ComicPanel as ComicPanelType } from "@/lib/types";
import TextOverlay from "./TextOverlay";

interface ComicPanelProps {
  panel: ComicPanelType;
}

const layoutClasses: Record<string, string> = {
  normal: "col-span-2 row-span-1",
  wide: "col-span-3 row-span-1",
  tall: "col-span-2 row-span-2",
  large: "col-span-3 row-span-2",
};

export default function ComicPanel({ panel }: ComicPanelProps) {
  const { imageUrl, overlays, layout } = panel;
  const gridClass = layoutClasses[layout] || layoutClasses.normal;

  return (
    <div
      className={`${gridClass} relative overflow-hidden border-2 border-gray-800 bg-gray-900`}
      style={{ minHeight: layout === "tall" || layout === "large" ? 400 : 200 }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`Panel ${panel.panelIndex + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600">
          <span className="text-sm">Panel {panel.panelIndex + 1}</span>
        </div>
      )}

      {overlays.map((overlay, i) => (
        <TextOverlay key={i} overlay={overlay} />
      ))}
    </div>
  );
}
