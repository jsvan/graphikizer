"use client";

import { useRef, useEffect, useCallback } from "react";
import type { TextOverlay as TextOverlayType } from "@/lib/types";

interface TextOverlayProps {
  overlay: TextOverlayType;
  overlayIndex?: number;
  editable?: boolean;
  onPositionChange?: (x: number, y: number) => void;
  /** Render as static block below the image instead of absolute overlay */
  renderBelow?: boolean;
}

/**
 * Compute a fixed pixel width for the bubble based on text length and type.
 */
function computeFixedWidth(text: string, type: string): number {
  const len = text.length;
  if (type === "dialogue") {
    if (len < 40) return 130;
    if (len < 80) return 180;
    return 240;
  }
  if (type === "narration") {
    if (len < 40) return 160;
    if (len < 80) return 220;
    return 280;
  }
  // caption
  if (len < 30) return 100;
  if (len < 60) return 150;
  return 200;
}

/**
 * Check if el overlaps any sibling .bubble-overlay elements
 * (excluding the element itself, identified by data-overlay-index).
 */
function overlapsAnySibling(el: HTMLElement): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  const myRect = el.getBoundingClientRect();
  const siblings = parent.querySelectorAll(".bubble-overlay");
  for (const sib of siblings) {
    if (sib === el) continue;
    const sibRect = sib.getBoundingClientRect();
    const overlapping = !(
      myRect.right <= sibRect.left ||
      sibRect.right <= myRect.left ||
      myRect.bottom <= sibRect.top ||
      sibRect.bottom <= myRect.top
    );
    if (overlapping) return true;
  }
  return false;
}

export default function TextOverlay({
  overlay,
  overlayIndex,
  editable,
  onPositionChange,
  renderBelow,
}: TextOverlayProps) {
  const { type, text, x, y, anchor, maxWidthPercent = 40, speaker } = overlay;
  const elRef = useRef<HTMLDivElement>(null);

  // --- Move drag ---
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    parentWidth: number;
    parentHeight: number;
    panelEl: HTMLElement | null;
  } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    const el = elRef.current;
    if (!drag || !el) return;
    e.preventDefault();
    el.style.left = `${drag.origLeft + (e.clientX - drag.startX)}px`;
    el.style.top = `${drag.origTop + (e.clientY - drag.startY)}px`;
  }, []);

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const el = elRef.current;
      const drag = dragRef.current;
      if (!el || !drag) {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        return;
      }

      const finalLeft = drag.origLeft + (e.clientX - drag.startX);
      const finalTop = drag.origTop + (e.clientY - drag.startY);

      // Temporarily apply final position so we can check overlap
      el.style.left = `${finalLeft}px`;
      el.style.top = `${finalTop}px`;

      const hasOverlap = overlapsAnySibling(el);

      // Restore styles back to CSS-positioned mode
      el.style.width = "";
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
      el.style.transform = "";
      el.style.cursor = "grab";
      el.style.zIndex = "10";
      el.style.maxWidth = "";

      // Restore panel z-index
      if (drag.panelEl) drag.panelEl.style.zIndex = "";

      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      // If overlapping a sibling bubble, snap back (don't update position)
      if (hasOverlap) return;

      const xPct = (finalLeft / drag.parentWidth) * 100;
      const yPct = (finalTop / drag.parentHeight) * 100;

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
      if (!el || !el.parentElement) return;
      e.preventDefault();
      e.stopPropagation();

      // Get visual position relative to the parent (the position: relative container)
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();
      const origLeft = rect.left - parentRect.left;
      const origTop = rect.top - parentRect.top;

      // Elevate the panel (grandparent grid item) so overflow shows above other panels
      const panelEl = el.parentElement.parentElement as HTMLElement | null;
      if (panelEl) panelEl.style.zIndex = "100";

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft,
        origTop,
        parentWidth: parentRect.width,
        parentHeight: parentRect.height,
        panelEl,
      };

      // Switch to pixel positioning, keeping same visual dimensions
      el.style.width = `${rect.width}px`;
      el.style.maxWidth = "none";
      el.style.left = `${origLeft}px`;
      el.style.top = `${origTop}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.transform = "none";
      el.style.cursor = "grabbing";
      el.style.zIndex = "9999";

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

  // --- Fixed width for the bubble ---
  const fixedWidth = computeFixedWidth(text, type);

  // --- Absolute overlay rendering ---
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    width: fixedWidth,
    maxWidth: `${maxWidthPercent}%`,
    zIndex: 10,
    overflowWrap: "break-word",
    wordWrap: "break-word",
  };

  // Anchor-aware positioning (same for edit and non-edit)
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

  if (editable) {
    positionStyle.cursor = "grab";
    positionStyle.userSelect = "none";
    positionStyle.WebkitUserSelect = "none";
  }

  const editableRing = editable
    ? " ring-2 ring-amber-400/50 ring-offset-1 ring-offset-transparent"
    : "";

  const bubbleClass = "bubble-overlay";

  // Narration box — cream parchment style
  if (type === "narration") {
    return (
      <div
        ref={elRef}
        data-overlay-index={overlayIndex}
        style={positionStyle}
        className={`${bubbleClass} bg-amber-50/95 border-2 border-gray-900 border-l-4 px-3 py-2 text-gray-900 text-sm italic leading-snug shadow-lg${editableRing}`}
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
        data-overlay-index={overlayIndex}
        style={positionStyle}
        className={`${bubbleClass} flex flex-col items-start${editableRing}`}
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
      data-overlay-index={overlayIndex}
      style={positionStyle}
      className={`${bubbleClass} bg-amber-100/95 border-2 border-gray-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-800 shadow-md${editableRing}`}
      onMouseDown={onMouseDown}
    >
      {text}
    </div>
  );
}
