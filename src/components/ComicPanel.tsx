"use client";

import type { ComicPanel as ComicPanelType } from "@/lib/types";
import TextOverlay from "./TextOverlay";

interface ComicPanelProps {
  panel: ComicPanelType;
  editable?: boolean;
  onOverlayPositionChange?: (overlayIndex: number, x: number, y: number) => void;
}

const layoutClasses: Record<string, string> = {
  normal: "col-span-2 row-span-1",
  wide: "col-span-3 row-span-1",
  tall: "col-span-2 row-span-2",
  large: "col-span-3 row-span-2",
};

export default function ComicPanel({ panel, editable, onOverlayPositionChange }: ComicPanelProps) {
  const { imageUrl, overlays, layout } = panel;
  const gridClass = layoutClasses[layout] || layoutClasses.normal;

  const hasDialogue = overlays.some((o) => o.type === "dialogue");

  // When dialogue is present, narration renders below the image instead of on top
  const aboveOverlays = overlays
    .map((o, i) => ({ overlay: o, index: i }))
    .filter(({ overlay }) => !(hasDialogue && overlay.type === "narration"));

  const belowOverlays = overlays
    .map((o, i) => ({ overlay: o, index: i }))
    .filter(({ overlay }) => hasDialogue && overlay.type === "narration");

  return (
    <div
      className={`${gridClass} flex flex-col border-2 border-gray-800 bg-gray-900`}
      style={{ overflow: "visible" }}
    >
      {/* Image + absolute overlays */}
      <div
        className="relative flex-1"
        style={{
          minHeight: layout === "tall" || layout === "large" ? 400 : 200,
          overflow: "visible",
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Panel ${panel.panelIndex + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <span className="text-sm">Panel {panel.panelIndex + 1}</span>
          </div>
        )}

        {aboveOverlays.map(({ overlay, index }) => (
          <TextOverlay
            key={index}
            overlay={overlay}
            overlayIndex={index}
            editable={editable}
            onPositionChange={
              onOverlayPositionChange
                ? (x, y) => onOverlayPositionChange(index, x, y)
                : undefined
            }
          />
        ))}
      </div>

      {/* Narration below image */}
      {belowOverlays.length > 0 && (
        <div className="space-y-px">
          {belowOverlays.map(({ overlay, index }) => (
            <TextOverlay
              key={index}
              overlay={overlay}
              overlayIndex={index}
              renderBelow
            />
          ))}
        </div>
      )}
    </div>
  );
}
