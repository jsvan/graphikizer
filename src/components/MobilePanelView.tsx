"use client";

import { useCallback, useRef } from "react";
import type { ComicPanel } from "@/lib/types";
import { TextOnlyPanelContent } from "./TextOnlyPanel";

interface MobilePanelViewProps {
  panels: ComicPanel[];
  currentPanel: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function MobilePanelView({
  panels,
  currentPanel,
  onPrev,
  onNext,
}: MobilePanelViewProps) {
  const panel = panels[currentPanel];
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const dy = touch.clientY - touchRef.current.startY;
      touchRef.current = null;

      // Only trigger if horizontal swipe is dominant and > 50px
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onNext();
        else onPrev();
      }
    },
    [onPrev, onNext]
  );

  if (!panel) return null;

  // Text-only panel: show content on dark gradient, keep nav
  if (panel.textOnly) {
    return (
      <div
        className="w-full"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onPrev}
            disabled={currentPanel === 0}
            className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            &larr;
          </button>
          <span className="text-gray-400 text-sm font-mono">
            Panel {currentPanel + 1} / {panels.length}
          </span>
          <button
            onClick={onNext}
            disabled={currentPanel === panels.length - 1}
            className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            &rarr;
          </button>
        </div>

        <div className="w-full border-y-2 border-gray-800">
          <TextOnlyPanelContent panel={panel} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800/50">
          <button
            onClick={onPrev}
            disabled={currentPanel === 0}
            className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            &larr; Prev
          </button>
          <button
            onClick={onNext}
            disabled={currentPanel === panels.length - 1}
            className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    );
  }

  const { imageUrl, overlays } = panel;

  // Split overlays into 3 groups
  const captions = overlays.filter((o) => o.type === "caption");
  const dialogues = overlays.filter((o) => o.type === "dialogue");
  const narrations = overlays.filter((o) => o.type === "narration");

  return (
    <div
      className="w-full"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Panel counter + nav */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onPrev}
          disabled={currentPanel === 0}
          className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          &larr;
        </button>
        <span className="text-gray-400 text-sm font-mono">
          Panel {currentPanel + 1} / {panels.length}
        </span>
        <button
          onClick={onNext}
          disabled={currentPanel === panels.length - 1}
          className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          &rarr;
        </button>
      </div>

      {/* Captions above image */}
      {captions.length > 0 && (
        <div className="px-3 py-1 space-y-1">
          {captions.map((overlay, i) => (
            <div
              key={`cap-${i}`}
              className="bg-amber-100 border-2 border-gray-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-800 shadow-sm"
            >
              {overlay.text}
            </div>
          ))}
        </div>
      )}

      {/* Panel image with dialogue bubbles on top */}
      <div className="w-full border-y-2 border-gray-800 bg-gray-900 relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Panel ${panel.panelIndex + 1}`}
            className="w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full aspect-[4/3] flex items-center justify-center text-gray-600">
            <span className="text-sm">Panel {panel.panelIndex + 1}</span>
          </div>
        )}

        {/* Dialogue bubbles positioned on the image */}
        {dialogues.map((overlay, i) => {
          // Clamp y to 0-45% so bubbles stay in upper half
          const clampedY = Math.min(Math.max(overlay.y || 5, 0), 45);
          const xPos = overlay.x || 10;

          return (
            <div
              key={`dlg-${i}`}
              style={{
                position: "absolute",
                left: `${xPos}%`,
                top: `${clampedY}%`,
                maxWidth: "60%",
                zIndex: 30,
              }}
            >
              {overlay.speaker && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mb-0.5 px-1 block"
                  style={{
                    textShadow:
                      "1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)",
                  }}
                >
                  {overlay.speaker}
                </span>
              )}
              <div className="bg-white/95 text-gray-900 rounded-md px-2 py-1.5 text-xs leading-snug border border-gray-900 shadow-lg relative">
                {overlay.text}
                <div className="absolute -bottom-1.5 left-3 w-2 h-2 bg-white/95 border-b border-r border-gray-900 rotate-45" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Narration below image */}
      {narrations.length > 0 && (
        <div className="px-3 py-2 space-y-2">
          {narrations.map((overlay, i) => (
            <div
              key={`nar-${i}`}
              className="bg-amber-50 border-2 border-gray-900 border-l-4 px-4 py-2.5 text-gray-900 text-sm italic leading-relaxed shadow-md"
            >
              {overlay.text}
            </div>
          ))}
        </div>
      )}

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800/50">
        <button
          onClick={onPrev}
          disabled={currentPanel === 0}
          className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          &larr; Prev
        </button>
        <button
          onClick={onNext}
          disabled={currentPanel === panels.length - 1}
          className="px-4 py-2 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
