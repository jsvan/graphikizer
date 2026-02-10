"use client";

import { useMemo } from "react";
import type { ComicPanel as ComicPanelType, CharacterVoiceProfile } from "@/lib/types";
import TextOverlay from "./TextOverlay";
import CharacterMarble from "./CharacterMarble";
import { useVoicePanelState } from "@/hooks/useVoicePanelState";
import { resolveMarbleCollisions } from "@/lib/marbleCollision";

interface AudioComicPanelProps {
  panel: ComicPanelType;
  voices: CharacterVoiceProfile[];
}

const layoutClasses: Record<string, string> = {
  normal: "col-span-2 row-span-1",
  wide: "col-span-3 row-span-1",
  tall: "col-span-2 row-span-2",
  large: "col-span-3 row-span-2",
};

export default function AudioComicPanel({
  panel,
  voices,
}: AudioComicPanelProps) {
  const { imageUrl, overlays, layout } = panel;
  const gridClass = layoutClasses[layout] || layoutClasses.normal;
  const { activeOverlay, voiceState, play, stop } = useVoicePanelState();

  const voiceMap = new Map(voices.map((v) => [v.speaker, v]));

  // Collect dialogue overlays with audio and compute collision-adjusted marble positions
  const dialogueAudioIndices = useMemo(
    () =>
      overlays.reduce<number[]>((acc, o, i) => {
        if (o.type === "dialogue" && o.audioUrl) acc.push(i);
        return acc;
      }, []),
    [overlays]
  );

  const adjustedMarblePositions = useMemo(
    () =>
      resolveMarbleCollisions(
        dialogueAudioIndices.map(
          (i) => overlays[i].characterPosition || panel.focalPoint || "center"
        ),
        overlays
      ),
    [dialogueAudioIndices, overlays, panel.focalPoint]
  );

  // Map from overlay index to adjusted position index
  const marblePositionMap = useMemo(() => {
    const m = new Map<number, number>();
    dialogueAudioIndices.forEach((overlayIdx, marbleIdx) => {
      m.set(overlayIdx, marbleIdx);
    });
    return m;
  }, [dialogueAudioIndices]);

  return (
    <div
      className={`${gridClass} flex flex-col border-2 border-gray-800 bg-gray-900`}
      style={{ overflow: "visible" }}
    >
      {/* Image + marbles + conditional overlays */}
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

        {overlays.map((overlay, i) => {
          const isDialogue = overlay.type === "dialogue";
          const isActive = activeOverlay === i;

          if (isDialogue && overlay.audioUrl) {
            const voice = overlay.speaker ? voiceMap.get(overlay.speaker) : null;
            const isNarrator = voice?.isNarrator ?? false;
            const marbleIdx = marblePositionMap.get(i);
            const marblePos =
              marbleIdx !== undefined
                ? adjustedMarblePositions[marbleIdx]
                : overlay.characterPosition || panel.focalPoint || "center";

            return (
              <div key={i}>
                {/* Marble — always visible */}
                <CharacterMarble
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
                {/* Dialogue — shown only when active */}
                {isActive && (
                  <TextOverlay overlay={overlay} overlayIndex={i} />
                )}
              </div>
            );
          }

          // Non-dialogue overlays (narration, caption) — always visible
          if (!isDialogue) {
            return (
              <TextOverlay key={i} overlay={overlay} overlayIndex={i} />
            );
          }

          // Dialogue without audioUrl — render statically
          return <TextOverlay key={i} overlay={overlay} overlayIndex={i} />;
        })}
      </div>
    </div>
  );
}
