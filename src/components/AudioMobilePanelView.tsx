"use client";

import { useCallback, useRef } from "react";
import type { ComicPanel, CharacterVoiceProfile } from "@/lib/types";
import CharacterMarble from "./CharacterMarble";
import { useVoicePanelState } from "@/hooks/useVoicePanelState";

interface AudioMobilePanelViewProps {
  panels: ComicPanel[];
  currentPanel: number;
  onPrev: () => void;
  onNext: () => void;
  voices: CharacterVoiceProfile[];
}

export default function AudioMobilePanelView({
  panels,
  currentPanel,
  onPrev,
  onNext,
  voices,
}: AudioMobilePanelViewProps) {
  const panel = panels[currentPanel];
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const { activeOverlay, voiceState, play, stop } = useVoicePanelState();

  const voiceMap = new Map(voices.map((v) => [v.speaker, v]));

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

      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onNext();
        else onPrev();
      }
    },
    [onPrev, onNext]
  );

  if (!panel) return null;

  const { imageUrl, overlays } = panel;

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

      {/* Panel image with marbles */}
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

        {/* Marbles over image for dialogue overlays */}
        {overlays.map((overlay, i) => {
          if (overlay.type !== "dialogue" || !overlay.audioUrl) return null;
          const voice = overlay.speaker
            ? voiceMap.get(overlay.speaker)
            : null;
          const isNarrator = voice?.isNarrator ?? false;
          const marblePos =
            overlay.characterPosition || panel.focalPoint || "center";
          const isActive = activeOverlay === i;

          return (
            <CharacterMarble
              key={i}
              position={marblePos}
              onClick={() => {
                if (isActive && voiceState === "playing") {
                  stop();
                } else {
                  play(i, overlay.audioUrl!);
                }
              }}
              isPlaying={isActive && voiceState === "playing"}
              isLoading={isActive && voiceState === "loading"}
              isNarrator={isNarrator}
              speaker={overlay.speaker}
            />
          );
        })}
      </div>

      {/* Overlays below image */}
      {overlays.length > 0 && (
        <div className="px-3 py-2 space-y-2">
          {overlays.map((overlay, i) => {
            const isDialogue = overlay.type === "dialogue";
            const isActive = activeOverlay === i;

            // Dialogue with audio: only show when active
            if (isDialogue && overlay.audioUrl && !isActive) {
              return null;
            }

            if (isDialogue) {
              return (
                <div key={i}>
                  {overlay.speaker && (
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1 px-1">
                      {overlay.speaker}
                    </div>
                  )}
                  <div className="bg-white text-gray-900 rounded-lg px-4 py-2.5 text-sm leading-relaxed border-2 border-gray-900 shadow-md relative">
                    {overlay.text}
                    <div className="absolute -top-2 left-4 w-3 h-3 bg-white border-t-2 border-l-2 border-gray-900 rotate-45" />
                  </div>
                </div>
              );
            }

            if (overlay.type === "narration") {
              return (
                <div
                  key={i}
                  className="bg-amber-50 border-2 border-gray-900 border-l-4 px-4 py-2.5 text-gray-900 text-sm italic leading-relaxed shadow-md"
                >
                  {overlay.text}
                </div>
              );
            }

            // caption
            return (
              <div
                key={i}
                className="bg-amber-100 border-2 border-gray-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-800 shadow-sm"
              >
                {overlay.text}
              </div>
            );
          })}
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
