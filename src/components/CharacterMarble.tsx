"use client";

import type { FocalPoint } from "@/lib/types";

interface CharacterMarbleProps {
  position: FocalPoint;
  onClick: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  isNarrator?: boolean;
  speaker?: string;
}

/** Map FocalPoint to CSS percentage positions within the panel */
function getPositionStyle(position: FocalPoint): React.CSSProperties {
  const xMap: Record<string, string> = {
    left: "12%",
    center: "50%",
    right: "88%",
    top: "50%",
    bottom: "50%",
    "top-left": "12%",
    "top-right": "88%",
    "bottom-left": "12%",
    "bottom-right": "88%",
  };
  const yMap: Record<string, string> = {
    left: "45%",
    center: "45%",
    right: "45%",
    top: "15%",
    bottom: "75%",
    "top-left": "15%",
    "top-right": "15%",
    "bottom-left": "75%",
    "bottom-right": "75%",
  };

  return {
    position: "absolute",
    left: xMap[position] || "50%",
    top: yMap[position] || "45%",
    transform: "translate(-50%, -50%)",
    zIndex: 20,
  };
}

export default function CharacterMarble({
  position,
  onClick,
  isPlaying,
  isLoading,
  isNarrator,
  speaker,
}: CharacterMarbleProps) {
  const posStyle = getPositionStyle(position);

  // For narrators, override y position to bottom area
  if (isNarrator) {
    posStyle.top = "75%";
  }

  return (
    <button
      onClick={onClick}
      style={posStyle}
      className={`group flex items-center justify-center ${
        isNarrator ? "w-10 h-14" : "w-6 h-6"
      }`}
      title={speaker || (isNarrator ? "Narrator" : "Play audio")}
      aria-label={isPlaying ? "Stop audio" : `Play ${speaker || "dialogue"}`}
    >
      {/* Narrator silhouette behind marble */}
      {isNarrator && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg
            width="40"
            height="56"
            viewBox="0 0 40 56"
            fill="none"
            className="opacity-80"
          >
            {/* Head */}
            <circle cx="20" cy="12" r="8" fill="black" />
            {/* Body */}
            <path
              d="M10 24 C10 20, 30 20, 30 24 L32 48 C32 52, 8 52, 8 48 Z"
              fill="black"
            />
          </svg>
        </div>
      )}

      {/* The golden marble */}
      <div
        className={`relative rounded-full ${
          isPlaying
            ? "marble-playing"
            : isLoading
              ? "opacity-70"
              : "marble-pulse"
        } ${isNarrator ? "w-4 h-4" : "w-5 h-5"}`}
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #fde68a, #f59e0b, #b45309)",
          cursor: "pointer",
          zIndex: 21,
        }}
      />
    </button>
  );
}
