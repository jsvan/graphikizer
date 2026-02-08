"use client";

import type { TextOverlay as TextOverlayType } from "@/lib/types";

interface TextOverlayProps {
  overlay: TextOverlayType;
}

export default function TextOverlay({ overlay }: TextOverlayProps) {
  const { type, text, x, y, anchor, maxWidthPercent = 40, speaker } = overlay;

  const positionStyle: React.CSSProperties = {
    position: "absolute",
    maxWidth: `${maxWidthPercent}%`,
    zIndex: 10,
  };

  // Position based on anchor
  if (anchor === "top-left" || anchor === "bottom-left") {
    positionStyle.left = `${x}%`;
  } else if (anchor === "top-right" || anchor === "bottom-right") {
    positionStyle.right = `${100 - x}%`;
  } else {
    positionStyle.left = `${x}%`;
    positionStyle.transform = "translateX(-50%)";
  }

  if (anchor === "top-left" || anchor === "top-right") {
    positionStyle.top = `${y}%`;
  } else if (anchor === "bottom-left" || anchor === "bottom-right") {
    positionStyle.bottom = `${100 - y}%`;
  } else {
    positionStyle.top = `${y}%`;
    positionStyle.transform = `${positionStyle.transform || ""} translateY(-50%)`.trim();
  }

  if (type === "narration") {
    return (
      <div
        style={positionStyle}
        className="bg-black/75 border-l-2 border-amber-400 px-3 py-2 text-gray-100 text-sm italic leading-snug"
      >
        {text}
      </div>
    );
  }

  if (type === "dialogue") {
    return (
      <div style={positionStyle} className="flex flex-col items-start">
        {speaker && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5 px-1">
            {speaker}
          </span>
        )}
        <div className="bg-white text-gray-900 rounded-lg px-3 py-2 text-sm leading-snug shadow-md relative">
          {text}
          {/* Speech bubble tail */}
          <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-white rotate-45" />
        </div>
      </div>
    );
  }

  // Caption
  return (
    <div
      style={positionStyle}
      className="bg-black/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300"
    >
      {text}
    </div>
  );
}
