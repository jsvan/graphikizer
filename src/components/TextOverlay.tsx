"use client";

import { useRef, useEffect, useCallback } from "react";
import type { TextOverlay as TextOverlayType } from "@/lib/types";

interface TextOverlayProps {
  overlay: TextOverlayType;
  editable?: boolean;
  onPositionChange?: (x: number, y: number) => void;
  /** Render as static block below the image instead of absolute overlay */
  renderBelow?: boolean;
}

export default function TextOverlay({
  overlay,
  editable,
  onPositionChange,
  renderBelow,
}: TextOverlayProps) {
  const { type, text, x, y, anchor, maxWidthPercent = 40, speaker } = overlay;
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    const el = elRef.current;
    if (!drag || !el) return;
    e.preventDefault();
    el.style.left = `${drag.origLeft + (e.clientX - drag.startX)}px`;
    el.style.top = `${drag.origTop + (e.clientY - drag.startY)}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
  }, []);

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const el = elRef.current;
      if (!el || !el.parentElement) {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        return;
      }

      el.style.cursor = "grab";

      // Convert pixel position to percentage of parent
      const parentRect = el.parentElement.getBoundingClientRect();
      const xPct = ((e.clientX - dragRef.current!.startX + dragRef.current!.origLeft) / parentRect.width) * 100;
      const yPct = ((e.clientY - dragRef.current!.startY + dragRef.current!.origTop) / parentRect.height) * 100;

      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      onPositionChange?.(
        Math.round(xPct * 100) / 100,
        Math.round(yPct * 100) / 100
      );
    },
    [onMouseMove, onPositionChange]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editable) return;
      const el = elRef.current;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: el.offsetLeft,
        origTop: el.offsetTop,
      };
      el.style.cursor = "grabbing";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [editable, onMouseMove, onMouseUp]
  );

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // --- Below-image rendering (static flow, no absolute positioning) ---
  if (renderBelow) {
    if (type === "narration") {
      return (
        <div className="bg-amber-50 border-l-4 border-gray-900 px-3 py-2 text-gray-900 text-sm italic leading-snug">
          {text}
        </div>
      );
    }
    return (
      <div className="bg-amber-100 border border-gray-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-800">
        {text}
      </div>
    );
  }

  // --- Absolute overlay rendering ---
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    maxWidth: `${maxWidthPercent}%`,
    zIndex: 10,
  };

  if (editable) {
    positionStyle.left = `${x}%`;
    positionStyle.top = `${y}%`;
    positionStyle.cursor = "grab";
  } else {
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
  }

  const editableRing = editable
    ? " ring-2 ring-amber-400/50 ring-offset-1 ring-offset-transparent"
    : "";

  // Narration box — cream parchment style
  if (type === "narration") {
    return (
      <div
        ref={elRef}
        style={positionStyle}
        className={`bg-amber-50/95 border-2 border-gray-900 border-l-4 px-3 py-2 text-gray-900 text-sm italic leading-snug shadow-lg${editableRing}`}
        onMouseDown={onMouseDown}
      >
        {text}
      </div>
    );
  }

  // Speech bubble
  if (type === "dialogue") {
    return (
      <div
        ref={elRef}
        style={positionStyle}
        className={`flex flex-col items-start${editableRing}`}
        onMouseDown={onMouseDown}
      >
        {speaker && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5 px-1"
            style={{
              textShadow:
                "1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {speaker}
          </span>
        )}
        <div className="bg-white text-gray-900 rounded-lg px-3 py-2 text-sm leading-snug border-2 border-gray-900 shadow-lg relative">
          {text}
          <div className="absolute -bottom-2 left-4 w-3 h-3 bg-white border-b-2 border-r-2 border-gray-900 rotate-45" />
        </div>
      </div>
    );
  }

  // Caption — cream comic style
  return (
    <div
      ref={elRef}
      style={positionStyle}
      className={`bg-amber-100/95 border-2 border-gray-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-800 shadow-md${editableRing}`}
      onMouseDown={onMouseDown}
    >
      {text}
    </div>
  );
}
