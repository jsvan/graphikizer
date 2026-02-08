"use client";

import { useRef, useCallback } from "react";
import type { ComicPanel as ComicPanelType, PanelMargins } from "@/lib/types";
import TextOverlay from "./TextOverlay";

interface ComicPanelProps {
  panel: ComicPanelType;
  editable?: boolean;
  onOverlayPositionChange?: (overlayIndex: number, x: number, y: number) => void;
  onOverlayResize?: (overlayIndex: number, maxWidthPercent: number) => void;
  onPanelMarginChange?: (margins: PanelMargins) => void;
}

const layoutClasses: Record<string, string> = {
  normal: "col-span-2 row-span-1",
  wide: "col-span-3 row-span-1",
  tall: "col-span-2 row-span-2",
  large: "col-span-3 row-span-2",
};

export default function ComicPanel({ panel, editable, onOverlayPositionChange, onOverlayResize, onPanelMarginChange }: ComicPanelProps) {
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

  // Panel drag support — uses transform: translate() so it works in grid
  const panelElRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  const onPanelMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    const el = panelElRef.current;
    if (!drag || !el) return;
    e.preventDefault();
    const dx = drag.origLeft + (e.clientX - drag.startX);
    const dy = drag.origTop + (e.clientY - drag.startY);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const onPanelMouseUp = useCallback(
    (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const newMargins: PanelMargins = {
        left: drag.origLeft + (e.clientX - drag.startX),
        top: drag.origTop + (e.clientY - drag.startY),
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
      e.preventDefault();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: panelMargins?.left || 0,
        origTop: panelMargins?.top || 0,
      };

      document.addEventListener("mousemove", onPanelMouseMove);
      document.addEventListener("mouseup", onPanelMouseUp);
    },
    [editable, onPanelMarginChange, panelMargins, onPanelMouseMove, onPanelMouseUp]
  );

  const offsetX = panelMargins?.left || 0;
  const offsetY = panelMargins?.top || 0;

  return (
    <div
      ref={panelElRef}
      className={`${gridClass} flex flex-col border-2 border-gray-800 bg-gray-900`}
      style={{
        overflow: "visible",
        transform: (offsetX || offsetY) ? `translate(${offsetX}px, ${offsetY}px)` : undefined,
        zIndex: (offsetX || offsetY) ? 5 : undefined,
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
            onResize={
              onOverlayResize
                ? (mw) => onOverlayResize(index, mw)
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
