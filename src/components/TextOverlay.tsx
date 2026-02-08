"use client";

import { useRef, useEffect, useCallback } from "react";
import type { TextOverlay as TextOverlayType } from "@/lib/types";

interface TextOverlayProps {
  overlay: TextOverlayType;
  editable?: boolean;
  onPositionChange?: (x: number, y: number) => void;
  onResize?: (maxWidthPercent: number) => void;
  /** Render as static block below the image instead of absolute overlay */
  renderBelow?: boolean;
}

export default function TextOverlay({
  overlay,
  editable,
  onPositionChange,
  onResize,
  renderBelow,
}: TextOverlayProps) {
  const { type, text, x, y, anchor, maxWidthPercent = 40, speaker } = overlay;
  const elRef = useRef<HTMLDivElement>(null);

  // --- Move drag ---
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origViewportLeft: number;
    origViewportTop: number;
    origWidth: number;
  } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    const el = elRef.current;
    if (!drag || !el) return;
    e.preventDefault();
    // Use fixed positioning during drag so the overlay floats above everything
    el.style.position = "fixed";
    el.style.width = `${drag.origWidth}px`;
    el.style.maxWidth = "none";
    el.style.left = `${drag.origViewportLeft + (e.clientX - drag.startX)}px`;
    el.style.top = `${drag.origViewportTop + (e.clientY - drag.startY)}px`;
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

      // Restore styles
      el.style.position = "absolute";
      el.style.width = "";
      el.style.maxWidth = "";
      el.style.cursor = "grab";
      el.style.zIndex = "10";

      // Convert final viewport position to percentage of parent
      const parentRect = el.parentElement.getBoundingClientRect();
      const finalViewportLeft = dragRef.current!.origViewportLeft + (e.clientX - dragRef.current!.startX);
      const finalViewportTop = dragRef.current!.origViewportTop + (e.clientY - dragRef.current!.startY);
      const xPct = ((finalViewportLeft - parentRect.left) / parentRect.width) * 100;
      const yPct = ((finalViewportTop - parentRect.top) / parentRect.height) * 100;

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

      // Capture viewport position and current pixel width
      const rect = el.getBoundingClientRect();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origViewportLeft: rect.left,
        origViewportTop: rect.top,
        origWidth: rect.width,
      };
      el.style.cursor = "grabbing";
      el.style.zIndex = "9999";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [editable, onMouseMove, onMouseUp]
  );

  // --- Resize drag (right edge) ---
  const resizeRef = useRef<{
    startX: number;
    origWidth: number;
    parentWidth: number;
  } | null>(null);

  const onResizeMove = useCallback((e: MouseEvent) => {
    const resize = resizeRef.current;
    const el = elRef.current;
    if (!resize || !el) return;
    e.preventDefault();
    const newWidth = Math.max(40, resize.origWidth + (e.clientX - resize.startX));
    el.style.width = `${newWidth}px`;
    el.style.maxWidth = "none";
  }, []);

  const onResizeUp = useCallback(
    (e: MouseEvent) => {
      const resize = resizeRef.current;
      const el = elRef.current;
      if (!resize || !el) {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onResizeMove);
        document.removeEventListener("mouseup", onResizeUp);
        return;
      }

      const newWidth = Math.max(40, resize.origWidth + (e.clientX - resize.startX));
      const newMaxWidthPct = Math.round((newWidth / resize.parentWidth) * 100 * 100) / 100;

      // Restore styles
      el.style.width = "";
      el.style.maxWidth = "";

      resizeRef.current = null;
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup", onResizeUp);

      onResize?.(Math.max(5, Math.min(100, newMaxWidthPct)));
    },
    [onResizeMove, onResize]
  );

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = elRef.current;
      if (!el || !el.parentElement) return;

      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();

      resizeRef.current = {
        startX: e.clientX,
        origWidth: rect.width,
        parentWidth: parentRect.width,
      };

      document.addEventListener("mousemove", onResizeMove);
      document.addEventListener("mouseup", onResizeUp);
    },
    [onResizeMove, onResizeUp]
  );

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup", onResizeUp);
    };
  }, [onMouseMove, onMouseUp, onResizeMove, onResizeUp]);

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

  // Resize handle (right edge)
  const resizeHandle = editable ? (
    <div
      onMouseDown={onResizeMouseDown}
      className="absolute top-0 -right-1 w-2 h-full cursor-ew-resize hover:bg-amber-400/30 transition-colors"
    />
  ) : null;

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
        {resizeHandle}
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
        {resizeHandle}
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
      {resizeHandle}
    </div>
  );
}
