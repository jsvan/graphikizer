"use client";

import { useRef, useCallback } from "react";
import type { ComicPanel as ComicPanelType, PanelMargins } from "@/lib/types";
import TextOverlay from "./TextOverlay";

interface ComicPanelProps {
  panel: ComicPanelType;
  editable?: boolean;
  onOverlayPositionChange?: (overlayIndex: number, x: number, y: number) => void;
  onPanelMarginChange?: (margins: PanelMargins) => void;
}

const layoutClasses: Record<string, string> = {
  normal: "col-span-2 row-span-1",
  wide: "col-span-3 row-span-1",
  tall: "col-span-2 row-span-2",
  large: "col-span-3 row-span-2",
};

export default function ComicPanel({ panel, editable, onOverlayPositionChange, onPanelMarginChange }: ComicPanelProps) {
  const { imageUrl, overlays, layout, panelMargins } = panel;
  const gridClass = layoutClasses[layout] || layoutClasses.normal;

  const hasDialogue = overlays.some((o) => o.type === "dialogue");

  // When dialogue is present, narration renders below the image instead of on top
  const aboveOverlays = overlays
    .map((o, i) => ({ overlay: o, index: i }))
    .filter(({ overlay }) => !(hasDialogue && overlay.type === "narration"));

  const belowOverlays = overlays
    .map((o, i) => ({ overlay: o, index: i }))
    .filter(({ overlay }) => hasDialogue && overlay.type === "narration");

  // Panel margin drag support
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origMargins: PanelMargins;
  } | null>(null);

  const onPanelMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    // Not visually moving during drag — we apply on release
  }, []);

  const onPanelMouseUp = useCallback(
    (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      const newMargins: PanelMargins = {
        top: Math.max(0, (drag.origMargins.top || 0) + dy),
        left: Math.max(0, (drag.origMargins.left || 0) + dx),
        bottom: drag.origMargins.bottom || 0,
        right: drag.origMargins.right || 0,
      };

      dragRef.current = null;
      document.removeEventListener("mousemove", onPanelMouseMove);
      document.removeEventListener("mouseup", onPanelMouseUp);
      onPanelMarginChange?.(newMargins);
    },
    [onPanelMouseMove, onPanelMarginChange]
  );

  const onPanelMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editable || !onPanelMarginChange) return;
      // Only start panel drag on the border area (not on overlays)
      if ((e.target as HTMLElement).closest("[data-overlay]")) return;
      e.preventDefault();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origMargins: panelMargins || {},
      };

      document.addEventListener("mousemove", onPanelMouseMove);
      document.addEventListener("mouseup", onPanelMouseUp);
    },
    [editable, onPanelMarginChange, panelMargins, onPanelMouseMove, onPanelMouseUp]
  );

  const marginStyle: React.CSSProperties = panelMargins
    ? {
        marginTop: panelMargins.top || 0,
        marginRight: panelMargins.right || 0,
        marginBottom: panelMargins.bottom || 0,
        marginLeft: panelMargins.left || 0,
      }
    : {};

  return (
    <div
      className={`${gridClass} flex flex-col border-2 border-gray-800 bg-gray-900`}
      style={{
        ...marginStyle,
        overflow: "visible",
        ...(editable && onPanelMarginChange ? { cursor: "move" } : {}),
      }}
      onMouseDown={onPanelMouseDown}
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
              renderBelow
            />
          ))}
        </div>
      )}
    </div>
  );
}
